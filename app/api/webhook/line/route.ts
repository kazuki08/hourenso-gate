import crypto from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  appendLineLinkRecord,
  getLatestLineLinkRecordByType,
  getMissingLineLinkEnvVars,
  type LineRecipientType,
} from "@/lib/line-link-store";
import { clearPendingDraft, getPendingDraft, setPendingDraft } from "@/lib/line-draft-store";
import { notifyToLine } from "@/lib/notifiers";
import { getNotionDailyMemo } from "@/lib/notion-phase1";
import { DEFAULT_AI_FORMAT_PROMPT } from "@/lib/prompts";
import {
  appendReportHistory,
  getMissingReportHistoryEnvVars,
} from "@/lib/report-history-store";
import { normalizeEnvValue, toJstIsoString } from "@/lib/env-utils";
import {
  appendLineUserSetting,
  getLatestLineUserSetting,
  getMissingLineUserSettingsEnvVars,
  type LineForwardType,
} from "@/lib/line-user-settings-store";
import {
  appendLineInviteRecord,
  getLatestInviteByCode,
  getMissingLineInviteEnvVars,
} from "@/lib/line-invite-store";
import {
  appendLineMemberLinkRecord,
  getLatestActiveMemberLink,
  getLatestMemberLink,
  getMissingLineMemberLinkEnvVars,
} from "@/lib/line-member-link-store";
import {
  appendLineAdminRecord,
  getActiveLineAdminIds,
  getMissingLineAdminEnvVars,
} from "@/lib/line-admin-store";
import {
  appendLineOrganizationRecord,
  getLatestActiveOrganizationByLineUserId,
  getMissingLineOrganizationEnvVars,
} from "@/lib/line-organization-store";

type LineWebhookEvent = {
  type?: string;
  replyToken?: string;
  message?: {
    type?: string;
    text?: string;
  };
  source?: {
    type?: "user" | "group" | "room";
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
};

type LineWebhookBody = {
  events?: LineWebhookEvent[];
};

type ProcessSummary = {
  linked: number;
  draftsGenerated: number;
  finalsForwarded: number;
  skipped: number;
  eventErrors: Array<{ index: number; type: string; reason: string }>;
};

type LinkEventResult =
  | { linked: true }
  | { linked: false; reason: string };

type MessageEventResult =
  | { status: "draft_generated" }
  | { status: "final_forwarded" }
  | { status: "skipped"; reason: string };

const WEBHOOK_LOG_PREFIX = "[LINE Webhook]";
const WEBHOOK_EXTERNAL_TIMEOUT_MS = 3500;
const BOT_INFO_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
let cachedLineAddFriendUrl = "";
let cachedLineAddFriendUrlAt = 0;

async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label}_timeout_${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getLineToken() {
  return normalizeEnvValue(process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

function isValidLineSignature(rawBody: string, signature: string) {
  const channelSecret = normalizeEnvValue(process.env.LINE_CHANNEL_SECRET);
  if (!channelSecret) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  return digest === signature;
}

function getSourceActorId(source: LineWebhookEvent["source"]) {
  return source?.userId || source?.groupId || source?.roomId || "";
}

function detectRecipient(source: LineWebhookEvent["source"]) {
  const candidateId = source?.groupId || source?.userId || source?.roomId || "";
  if (!candidateId) {
    return null;
  }

  let recipientType: LineRecipientType | null = null;
  if (candidateId.startsWith("C")) {
    recipientType = "group";
  } else if (candidateId.startsWith("U")) {
    recipientType = "user";
  }

  if (!recipientType) {
    return null;
  }

  return { lineId: candidateId, recipientType };
}

async function replyLineMessage(replyToken: string, text: string) {
  const token = getLineToken();
  if (!token) {
    throw new Error("missing_env_var:LINE_CHANNEL_ACCESS_TOKEN");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE reply failed: ${response.status} ${detail}`);
  }
}

async function resolveLineAddFriendUrl() {
  const now = Date.now();
  if (cachedLineAddFriendUrl && now - cachedLineAddFriendUrlAt < BOT_INFO_CACHE_TTL_MS) {
    return cachedLineAddFriendUrl;
  }

  const token = getLineToken();
  if (!token) {
    return "";
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/info", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`line_bot_info_failed:${response.status}`);
    }
    const payload = (await response.json()) as { basicId?: string };
    const basicId = (payload.basicId || "").trim();
    if (!basicId) {
      return "";
    }
    cachedLineAddFriendUrl = `https://line.me/R/ti/p/${basicId}`;
    cachedLineAddFriendUrlAt = now;
    return cachedLineAddFriendUrl;
  } catch (error) {
    console.error(
      `${WEBHOOK_LOG_PREFIX} bot info fetch failed`,
      JSON.stringify({
        message: error instanceof Error ? error.message : "unknown",
      })
    );
    return "";
  }
}

function isCreateDraftTrigger(text: string) {
  return text.includes("日報作成");
}

function parseForwardSettingCommand(text: string): LineForwardType | null {
  const normalized = text.trim();
  if (normalized === "設定 個人" || normalized === "送信先設定 個人") return "user";
  if (normalized === "設定 グループ" || normalized === "送信先設定 グループ") return "group";
  return null;
}

function isForwardSettingCheckCommand(text: string) {
  const normalized = text.trim();
  return normalized === "設定確認" || normalized === "送信先設定確認";
}

function isGroupRegisterCommand(text: string) {
  const normalized = text.trim();
  return normalized === "グループ登録" || normalized === "送信先登録 グループ";
}

function isGroupCheckCommand(text: string) {
  const normalized = text.trim();
  return normalized === "グループ確認" || normalized === "送信先確認 グループ";
}

function isCreateMemberInviteCommand(text: string) {
  const normalized = text.trim();
  return (
    normalized === "部下招待" ||
    normalized === "招待作成" ||
    normalized === "部下招待URL" ||
    normalized === "招待URL発行"
  );
}

function parseMemberLinkCommand(text: string) {
  const normalized = text.trim();
  const match = normalized.match(/^(?:連携|招待連携)\s+([A-Za-z0-9_-]{6,32})$/);
  if (!match) return null;
  return match[1].toUpperCase();
}

function createInviteCode() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

function getEnvInviteCreatorAllowlist() {
  const raw = normalizeEnvValue(process.env.LINE_INVITE_CREATOR_ALLOWLIST);
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function isInviteCommandAllowed(lineUserId: string) {
  if (!lineUserId) return false;
  const envAllowlist = getEnvInviteCreatorAllowlist();
  if (envAllowlist.includes(lineUserId)) {
    return true;
  }
  const missing = getMissingLineAdminEnvVars();
  if (missing.length > 0) {
    return envAllowlist.length === 0;
  }
  try {
    const activeAdminIds = await getActiveLineAdminIds();
    return activeAdminIds.includes(lineUserId);
  } catch {
    return envAllowlist.length === 0;
  }
}

function parseInviteRevokeCommand(text: string) {
  const normalized = text.trim();
  const match = normalized.match(/^(?:招待無効化|招待取消)\s+([A-Za-z0-9_-]{6,32})$/);
  if (!match) return null;
  return match[1].toUpperCase();
}

function isMemberUnlinkCommand(text: string) {
  const normalized = text.trim();
  return normalized === "連携解除" || normalized === "解除";
}

function isCurrentLinkCheckCommand(text: string) {
  const normalized = text.trim();
  return normalized === "現在の連携先確認" || normalized === "連携先確認";
}

function parseAdminAddCommand(text: string) {
  const normalized = text.trim();
  const match = normalized.match(/^(?:管理者追加|管理者登録)\s+(U[A-Za-z0-9]{8,})$/);
  return match ? match[1] : null;
}

function parseAdminRemoveCommand(text: string) {
  const normalized = text.trim();
  const match = normalized.match(/^(?:管理者削除|管理者解除)\s+(U[A-Za-z0-9]{8,})$/);
  return match ? match[1] : null;
}

function isAdminListCommand(text: string) {
  const normalized = text.trim();
  return normalized === "管理者確認" || normalized === "管理者一覧";
}

function parseOrganizationSetCommand(text: string) {
  const normalized = text.trim();
  const match = normalized.match(/^(?:組織設定|組織名設定)\s+(.{1,40})$/);
  if (!match) return null;
  return match[1].trim();
}

function isOrganizationCheckCommand(text: string) {
  const normalized = text.trim();
  return normalized === "組織確認" || normalized === "組織名確認";
}

function isHelpCommand(text: string) {
  const normalized = text.trim();
  return normalized === "ヘルプ" || normalized === "help" || normalized === "使い方";
}

function maskLineId(value: string) {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function sanitizeFinalReportText(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) return "";

  let normalized = trimmed;
  const isWrappedInDoubleQuotes =
    normalized.startsWith("\"") && normalized.endsWith("\"");
  const isWrappedInJapaneseQuotes =
    normalized.startsWith("「") && normalized.endsWith("」");
  if (isWrappedInDoubleQuotes || isWrappedInJapaneseQuotes) {
    normalized = normalized.slice(1, -1).trim();
  }

  const boilerplatePatterns = [
    /^日報ドラフトを作成しました。必要な箇所を修正して、そのまま返信すると確定版として転送します。?$/,
    /^※必要に応じて加筆・修正して、このまま返信してください。?$/,
  ];

  const lines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !boilerplatePatterns.some((pattern) => pattern.test(line)));

  const cleaned = lines
    .map((line) => line.replace(/^#{1,6}\s+/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

async function generateDraftWithGemini(params: {
  notionText: string;
  customPrompt?: string;
}) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("missing_env_var:GEMINI_API_KEY");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash"] as const;
  const systemPrompt =
    params.customPrompt?.trim() || process.env.LINE_DRAFT_SYSTEM_PROMPT || DEFAULT_AI_FORMAT_PROMPT;
  const prompt = [
    "あなたは報連相アシスタントです。以下の生メモを基に、LINEでそのまま編集しやすい日報ドラフトを作ってください。",
    "・箇条書き中心、簡潔、重要事項優先",
    "・冒頭に【報告】を付ける",
    "・最後に相談事項があれば1行で添える",
    "",
    "【生メモ】",
    params.notionText || "（本日のメモなし）",
  ].join("\n");

  let lastError: unknown;
  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (!text) throw new Error("empty_ai_response");
      return text;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function buildFallbackDraft(notionText: string) {
  const memo = notionText.trim() || "（本日の更新メモが見つかりませんでした）";
  return [
    "【報告】本日の進捗を共有します。",
    memo.length > 220 ? `${memo.slice(0, 220)}...` : memo,
    "",
    "※必要に応じて加筆・修正して、このまま返信してください。",
  ].join("\n");
}

async function handleLinkEvent(
  event: LineWebhookEvent,
  request: Request
): Promise<LinkEventResult> {
  const missing = getMissingLineLinkEnvVars();
  if (missing.length > 0) {
    return { linked: false, reason: `missing_env_vars:${missing.join(",")}` };
  }

  const clerkUserId = resolveClerkUserId(request);
  if (!clerkUserId) {
    return { linked: false, reason: "clerk_user_id_missing" };
  }

  const detected = detectRecipient(event.source);
  if (!detected) {
    return { linked: false, reason: "recipient_not_detected" };
  }

  await appendLineLinkRecord(
    {
      createdAt: toJstIsoString(),
      clerkUserId,
      recipientType: detected.recipientType,
      lineId: detected.lineId,
      eventType: event.type || "unknown",
    },
    JSON.stringify(event.source || {})
  );
  return { linked: true };
}

function resolveClerkUserId(request: Request) {
  const reqUrl = new URL(request.url);
  return (
    reqUrl.searchParams.get("clerkUserId") ||
    request.headers.get("x-clerk-user-id") ||
    process.env.LINE_DEFAULT_CLERK_USER_ID ||
    ""
  ).trim();
}

async function resolveDynamicForwardTargetWithType(
  clerkUserId: string,
  preferredType: LineRecipientType
) {
  const primaryType: LineRecipientType = preferredType;
  const secondaryType: LineRecipientType = primaryType === "group" ? "user" : "group";

  const primary = await getLatestLineLinkRecordByType(clerkUserId, primaryType);
  if (primary) {
    return { lineId: primary.lineId, recipientType: primary.recipientType };
  }

  const secondary = await getLatestLineLinkRecordByType(clerkUserId, secondaryType);
  if (secondary) {
    return { lineId: secondary.lineId, recipientType: secondary.recipientType };
  }

  return null;
}

async function handleMessageEvent(
  event: LineWebhookEvent,
  request: Request
): Promise<MessageEventResult> {
  const replyToken = event.replyToken || "";
  const text = event.message?.text?.trim() || "";
  const actorId = getSourceActorId(event.source);
  const lineUserId = event.source?.userId || "";
  if (!replyToken || !text || !actorId) {
    return { status: "skipped" as const, reason: "invalid_message_event" };
  }

  const setType = parseForwardSettingCommand(text);
  if (setType) {
    if (!lineUserId) {
      await replyLineMessage(
        replyToken,
        "送信先設定はユーザーIDが取得できるチャットで実行してください。"
      );
      return { status: "skipped", reason: "line_user_id_missing_for_setting" };
    }
    const missing = getMissingLineUserSettingsEnvVars();
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `設定保存に必要な環境変数が不足しています: ${missing.join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_setting" };
    }
    try {
      await appendLineUserSetting({
        createdAt: toJstIsoString(),
        lineUserId,
        forwardType: setType,
        updatedBy: lineUserId,
        status: "active",
      });
      await replyLineMessage(
        replyToken,
        `送信先設定を「${setType === "group" ? "グループ宛" : "個人宛"}」に更新しました。`
      );
      return { status: "skipped", reason: "setting_updated" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `送信先設定の保存に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "setting_update_failed" };
    }
  }

  if (isHelpCommand(text)) {
    await replyLineMessage(
      replyToken,
      [
        "【部下向け】",
        "・日報作成",
        "・連携 <コード>",
        "・現在の連携先確認",
        "・連携解除",
        "",
        "【上司/管理者向け】",
        "・部下招待 / 招待URL発行",
        "・招待無効化 <コード>",
        "・組織設定 <組織名>",
        "・組織確認",
        "・管理者追加 <LINE_USER_ID>",
        "・管理者削除 <LINE_USER_ID>",
        "・管理者確認",
        "",
        "【送信先運用】",
        "・設定 個人 / 設定 グループ / 設定確認",
        "・グループ登録 / グループ確認",
      ].join("\n")
    );
    return { status: "skipped", reason: "help_shown" };
  }

  if (isForwardSettingCheckCommand(text)) {
    if (!lineUserId) {
      await replyLineMessage(replyToken, "現在の送信先設定を取得できませんでした。");
      return { status: "skipped", reason: "line_user_id_missing_for_setting_check" };
    }
    try {
      const setting = await getLatestLineUserSetting(lineUserId);
      await replyLineMessage(
        replyToken,
        setting
          ? `現在の送信先設定: ${setting.forwardType === "group" ? "グループ宛" : "個人宛"}`
          : "現在の送信先設定は未登録です。`設定 個人` または `設定 グループ` と送信してください。"
      );
      return { status: "skipped", reason: "setting_checked" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `送信先設定の確認に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "setting_check_failed" };
    }
  }

  if (isGroupRegisterCommand(text)) {
    const groupId = event.source?.groupId || "";
    if (!groupId) {
      await replyLineMessage(
        replyToken,
        "このコマンドはグループトーク内で実行してください。"
      );
      return { status: "skipped", reason: "group_register_outside_group" };
    }

    const clerkUserId = resolveClerkUserId(request);
    if (!clerkUserId) {
      await replyLineMessage(
        replyToken,
        "連携ユーザーIDが未設定です。Webhook URL の clerkUserId を確認してください。"
      );
      return { status: "skipped", reason: "clerk_user_id_missing_for_group_register" };
    }

    try {
      await appendLineLinkRecord(
        {
          createdAt: toJstIsoString(),
          clerkUserId,
          recipientType: "group",
          lineId: groupId,
          eventType: "group_register_command",
        },
        JSON.stringify(event.source || {})
      );

      await replyLineMessage(
        replyToken,
        "このグループを送信先として登録しました。必要に応じて Bot の1:1トークで `設定 グループ` も実行してください。"
      );
      return { status: "skipped", reason: "group_registered" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `グループ登録に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "group_register_failed" };
    }
  }

  if (isGroupCheckCommand(text)) {
    if (event.source?.groupId) {
      await replyLineMessage(
        replyToken,
        "このコマンドは Bot との1:1トークで実行してください。"
      );
      return { status: "skipped", reason: "group_check_inside_group" };
    }

    const clerkUserId = resolveClerkUserId(request);
    if (!clerkUserId) {
      await replyLineMessage(
        replyToken,
        "連携ユーザーIDが未設定です。Webhook URL の clerkUserId を確認してください。"
      );
      return { status: "skipped", reason: "clerk_user_id_missing_for_group_check" };
    }

    try {
      const groupLink = await getLatestLineLinkRecordByType(clerkUserId, "group");
      if (!groupLink) {
        await replyLineMessage(
          replyToken,
          "登録済みの送信先グループが見つかりません。受信グループで `グループ登録` を実行してください。"
        );
        return { status: "skipped", reason: "group_link_not_found" };
      }

      const maskedGroupId =
        groupLink.lineId.length > 8
          ? `${groupLink.lineId.slice(0, 4)}...${groupLink.lineId.slice(-4)}`
          : groupLink.lineId;
      await replyLineMessage(
        replyToken,
        `現在の登録グループ: ${maskedGroupId}\n登録日時: ${groupLink.createdAt}`
      );
      return { status: "skipped", reason: "group_check_completed" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `グループ確認に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "group_check_failed" };
    }
  }

  const adminAddTarget = parseAdminAddCommand(text);
  if (adminAddTarget) {
    if (!lineUserId) {
      await replyLineMessage(replyToken, "このコマンドは Bot の1:1トークで実行してください。");
      return { status: "skipped", reason: "admin_add_user_id_missing" };
    }
    const missing = getMissingLineAdminEnvVars();
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `管理者設定に必要な環境変数が不足しています: ${missing.join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_admin_add" };
    }
    try {
      const envAllowlist = getEnvInviteCreatorAllowlist();
      const activeAdmins = await getActiveLineAdminIds();
      const canManage =
        envAllowlist.includes(lineUserId) ||
        activeAdmins.includes(lineUserId) ||
        (envAllowlist.length === 0 && activeAdmins.length === 0);
      if (!canManage) {
        await replyLineMessage(
          replyToken,
          "管理者追加は管理者のみ実行できます。"
        );
        return { status: "skipped", reason: "admin_add_not_allowed" };
      }
      await appendLineAdminRecord({
        createdAt: toJstIsoString(),
        lineUserId: adminAddTarget,
        status: "active",
        updatedBy: lineUserId,
      });
      await replyLineMessage(replyToken, `管理者を追加しました: ${maskLineId(adminAddTarget)}`);
      return { status: "skipped", reason: "admin_added" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `管理者追加に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "admin_add_failed" };
    }
  }

  const adminRemoveTarget = parseAdminRemoveCommand(text);
  if (adminRemoveTarget) {
    if (!lineUserId) {
      await replyLineMessage(replyToken, "このコマンドは Bot の1:1トークで実行してください。");
      return { status: "skipped", reason: "admin_remove_user_id_missing" };
    }
    const missing = getMissingLineAdminEnvVars();
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `管理者設定に必要な環境変数が不足しています: ${missing.join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_admin_remove" };
    }
    try {
      const canManage = await isInviteCommandAllowed(lineUserId);
      if (!canManage) {
        await replyLineMessage(replyToken, "管理者削除は管理者のみ実行できます。");
        return { status: "skipped", reason: "admin_remove_not_allowed" };
      }
      await appendLineAdminRecord({
        createdAt: toJstIsoString(),
        lineUserId: adminRemoveTarget,
        status: "inactive",
        updatedBy: lineUserId,
      });
      await replyLineMessage(replyToken, `管理者を削除しました: ${maskLineId(adminRemoveTarget)}`);
      return { status: "skipped", reason: "admin_removed" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `管理者削除に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "admin_remove_failed" };
    }
  }

  if (isAdminListCommand(text)) {
    if (!lineUserId) {
      await replyLineMessage(replyToken, "このコマンドは Bot の1:1トークで実行してください。");
      return { status: "skipped", reason: "admin_list_user_id_missing" };
    }
    const missing = getMissingLineAdminEnvVars();
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `管理者確認に必要な環境変数が不足しています: ${missing.join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_admin_list" };
    }
    try {
      const canManage = await isInviteCommandAllowed(lineUserId);
      if (!canManage) {
        await replyLineMessage(replyToken, "管理者確認は管理者のみ実行できます。");
        return { status: "skipped", reason: "admin_list_not_allowed" };
      }
      const admins = await getActiveLineAdminIds();
      if (admins.length === 0) {
        await replyLineMessage(replyToken, "有効な管理者は未登録です。");
        return { status: "skipped", reason: "admin_list_empty" };
      }
      await replyLineMessage(
        replyToken,
        `現在の管理者:\n${admins.map((id) => `- ${maskLineId(id)}`).join("\n")}`
      );
      return { status: "skipped", reason: "admin_list_completed" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `管理者確認に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "admin_list_failed" };
    }
  }

  const organizationName = parseOrganizationSetCommand(text);
  if (organizationName) {
    if (!lineUserId) {
      await replyLineMessage(replyToken, "このコマンドは Bot の1:1トークで実行してください。");
      return { status: "skipped", reason: "org_set_user_id_missing" };
    }
    const missing = getMissingLineOrganizationEnvVars();
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `組織設定に必要な環境変数が不足しています: ${missing.join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_org_set" };
    }
    if (!(await isInviteCommandAllowed(lineUserId))) {
      await replyLineMessage(replyToken, "組織設定は管理者のみ実行できます。");
      return { status: "skipped", reason: "org_set_not_allowed" };
    }
    try {
      await appendLineOrganizationRecord({
        createdAt: toJstIsoString(),
        lineUserId,
        organizationName,
        status: "active",
        updatedBy: lineUserId,
      });
      await replyLineMessage(replyToken, `組織名を設定しました: ${organizationName}`);
      return { status: "skipped", reason: "org_set_completed" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `組織設定に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "org_set_failed" };
    }
  }

  if (isOrganizationCheckCommand(text)) {
    if (!lineUserId) {
      await replyLineMessage(replyToken, "このコマンドは Bot の1:1トークで実行してください。");
      return { status: "skipped", reason: "org_check_user_id_missing" };
    }
    const missing = getMissingLineOrganizationEnvVars();
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `組織確認に必要な環境変数が不足しています: ${missing.join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_org_check" };
    }
    try {
      const org = await getLatestActiveOrganizationByLineUserId(lineUserId);
      await replyLineMessage(
        replyToken,
        org
          ? `現在の組織名: ${org.organizationName}`
          : "組織名は未設定です。`組織設定 <組織名>` で登録してください。"
      );
      return { status: "skipped", reason: "org_check_completed" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `組織確認に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "org_check_failed" };
    }
  }

  if (isCreateMemberInviteCommand(text)) {
    const missing = [
      ...getMissingLineInviteEnvVars(),
      ...getMissingLineMemberLinkEnvVars(),
    ];
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `招待コード発行に必要な環境変数が不足しています: ${Array.from(new Set(missing)).join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_invite_create" };
    }

    const target = detectRecipient(event.source);
    if (!target) {
      await replyLineMessage(replyToken, "送信先の識別に失敗しました。");
      return { status: "skipped", reason: "invite_target_not_detected" };
    }
    if (!lineUserId && target.recipientType === "user") {
      await replyLineMessage(
        replyToken,
        "招待コード作成はユーザーIDが取得できる1:1トークで実行してください。"
      );
      return { status: "skipped", reason: "invite_creator_user_id_missing" };
    }
    if (!lineUserId || !(await isInviteCommandAllowed(lineUserId))) {
      await replyLineMessage(
        replyToken,
        "このコマンドは管理者のみ実行できます。運用者に権限追加を依頼してください。"
      );
      return { status: "skipped", reason: "invite_creator_not_allowed" };
    }

    const createdAt = toJstIsoString();
    const expiresAt = toJstIsoString(Date.now() + 30 * 60 * 1000);
    const inviteCode = createInviteCode();
    try {
      let organizationNameForInvite = "未設定";
      try {
        const org = await getLatestActiveOrganizationByLineUserId(lineUserId);
        if (org?.organizationName) {
          organizationNameForInvite = org.organizationName;
        }
      } catch (error) {
        console.error(
          `${WEBHOOK_LOG_PREFIX} org lookup failed but invite continues`,
          JSON.stringify({
            lineUserId,
            message: error instanceof Error ? error.message : "unknown",
          })
        );
      }
      await appendLineInviteRecord({
        createdAt,
        inviteCode,
        targetLineId: target.lineId,
        targetRecipientType: target.recipientType,
        createdByLineUserId: lineUserId || actorId,
        expiresAt,
        status: "active",
        usedByLineUserId: "",
        usedAt: "",
      });
      const lineAddFriendUrl = await resolveLineAddFriendUrl();
      await replyLineMessage(
        replyToken,
        [
          `組織: ${organizationNameForInvite}`,
          `部下連携コード: ${inviteCode}`,
          "部下は Bot の1:1トークで次の1行をそのまま送信してください。",
          `【コピペ用】連携 ${inviteCode}`,
          "",
          "共有テンプレ:",
          `Bot追加後に「連携 ${inviteCode}」と送ってください。`,
          lineAddFriendUrl ? `Bot追加URL: ${lineAddFriendUrl}` : "",
          `有効期限: ${expiresAt}`,
        ]
          .filter(Boolean)
          .join("\n")
      );
      return { status: "skipped", reason: "invite_created" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `招待コード発行に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "invite_create_failed" };
    }
  }

  const inviteCode = parseMemberLinkCommand(text);
  if (inviteCode) {
    if (!lineUserId) {
      await replyLineMessage(
        replyToken,
        "連携は Bot の1:1トークで実行してください。"
      );
      return { status: "skipped", reason: "member_link_user_id_missing" };
    }
    const missing = [
      ...getMissingLineInviteEnvVars(),
      ...getMissingLineMemberLinkEnvVars(),
      ...getMissingLineUserSettingsEnvVars(),
    ];
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `連携保存に必要な環境変数が不足しています: ${Array.from(new Set(missing)).join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_member_link" };
    }
    try {
      const invite = await getLatestInviteByCode(inviteCode);
      if (!invite || invite.status !== "active") {
        await replyLineMessage(
          replyToken,
          "招待コードが無効です。上司から最新の招待コードを受け取ってください。"
        );
        return { status: "skipped", reason: "invite_invalid_or_missing" };
      }
      const expiresAt = Date.parse(invite.expiresAt);
      if (Number.isNaN(expiresAt) || Date.now() > expiresAt) {
        await replyLineMessage(
          replyToken,
          "招待コードの有効期限が切れています。上司に再発行を依頼してください。"
        );
        return { status: "skipped", reason: "invite_expired" };
      }

      const now = toJstIsoString();
      await appendLineMemberLinkRecord({
        createdAt: now,
        memberLineUserId: lineUserId,
        targetLineId: invite.targetLineId,
        targetRecipientType: invite.targetRecipientType,
        linkedByLineUserId: lineUserId,
        sourceInviteCode: invite.inviteCode,
        status: "active",
      });
      await appendLineInviteRecord({
        ...invite,
        createdAt: now,
        status: "used",
        usedByLineUserId: lineUserId,
        usedAt: now,
      });
      await appendLineUserSetting({
        createdAt: now,
        lineUserId,
        forwardType: invite.targetRecipientType,
        updatedBy: lineUserId,
        status: "active",
      });

      await replyLineMessage(
        replyToken,
        `連携が完了しました。以後の確定版は${invite.targetRecipientType === "group" ? "上司グループ" : "上司個人"}へ転送されます。`
      );
      return { status: "skipped", reason: "member_link_completed" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `連携に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "member_link_failed" };
    }
  }

  const inviteRevokeCode = parseInviteRevokeCommand(text);
  if (inviteRevokeCode) {
    if (!lineUserId) {
      await replyLineMessage(replyToken, "このコマンドは Bot の1:1トークで実行してください。");
      return { status: "skipped", reason: "invite_revoke_user_id_missing" };
    }
    if (!(await isInviteCommandAllowed(lineUserId))) {
      await replyLineMessage(
        replyToken,
        "このコマンドは管理者のみ実行できます。運用者に権限追加を依頼してください。"
      );
      return { status: "skipped", reason: "invite_revoke_not_allowed" };
    }
    const missing = getMissingLineInviteEnvVars();
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `招待無効化に必要な環境変数が不足しています: ${missing.join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_invite_revoke" };
    }
    try {
      const invite = await getLatestInviteByCode(inviteRevokeCode);
      if (!invite) {
        await replyLineMessage(replyToken, "指定コードが見つかりません。");
        return { status: "skipped", reason: "invite_revoke_not_found" };
      }
      if (invite.createdByLineUserId !== lineUserId) {
        await replyLineMessage(
          replyToken,
          "この招待コードはあなたが発行したものではないため無効化できません。"
        );
        return { status: "skipped", reason: "invite_revoke_not_owner" };
      }
      if (invite.status !== "active") {
        await replyLineMessage(replyToken, "この招待コードはすでに無効です。");
        return { status: "skipped", reason: "invite_revoke_already_inactive" };
      }

      await appendLineInviteRecord({
        ...invite,
        createdAt: toJstIsoString(),
        status: "revoked",
      });
      await replyLineMessage(replyToken, `招待コード ${inviteRevokeCode} を無効化しました。`);
      return { status: "skipped", reason: "invite_revoked" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `招待コード無効化に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "invite_revoke_failed" };
    }
  }

  if (isMemberUnlinkCommand(text)) {
    if (!lineUserId) {
      await replyLineMessage(replyToken, "このコマンドは Bot の1:1トークで実行してください。");
      return { status: "skipped", reason: "member_unlink_user_id_missing" };
    }
    const missing = getMissingLineMemberLinkEnvVars();
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `連携解除に必要な環境変数が不足しています: ${missing.join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_member_unlink" };
    }
    try {
      const latestLink = await getLatestMemberLink(lineUserId);
      if (!latestLink || latestLink.status !== "active") {
        await replyLineMessage(replyToken, "現在有効な連携はありません。");
        return { status: "skipped", reason: "member_unlink_no_active_link" };
      }
      await appendLineMemberLinkRecord({
        ...latestLink,
        createdAt: toJstIsoString(),
        status: "inactive",
      });
      await replyLineMessage(replyToken, "連携を解除しました。再設定は `連携 <コード>` を実行してください。");
      return { status: "skipped", reason: "member_unlinked" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `連携解除に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "member_unlink_failed" };
    }
  }

  if (isCurrentLinkCheckCommand(text)) {
    if (!lineUserId) {
      await replyLineMessage(replyToken, "このコマンドは Bot の1:1トークで実行してください。");
      return { status: "skipped", reason: "member_link_check_user_id_missing" };
    }
    const missing = getMissingLineMemberLinkEnvVars();
    if (missing.length > 0) {
      await replyLineMessage(
        replyToken,
        `連携先確認に必要な環境変数が不足しています: ${missing.join(", ")}`
      );
      return { status: "skipped", reason: "missing_env_for_member_link_check" };
    }
    try {
      const latestLink = await getLatestMemberLink(lineUserId);
      if (!latestLink || latestLink.status !== "active") {
        await replyLineMessage(
          replyToken,
          "現在の有効な連携先はありません。上司から受け取ったコードで `連携 <コード>` を実行してください。"
        );
        return { status: "skipped", reason: "member_link_check_no_active_link" };
      }
      await replyLineMessage(
        replyToken,
        [
          `現在の連携先タイプ: ${latestLink.targetRecipientType === "group" ? "グループ" : "個人"}`,
          `現在の連携先ID: ${maskLineId(latestLink.targetLineId)}`,
          `最終更新: ${latestLink.createdAt}`,
        ].join("\n")
      );
      return { status: "skipped", reason: "member_link_check_completed" };
    } catch (error) {
      await replyLineMessage(
        replyToken,
        `連携先確認に失敗しました。${error instanceof Error ? error.message : "unknown"}`
      );
      return { status: "skipped", reason: "member_link_check_failed" };
    }
  }

  if (isCreateDraftTrigger(text)) {
    let notionText = "";
    let customPrompt = "";
    let noMemoNotice = "";

    try {
      const notionData = await withTimeout(
        getNotionDailyMemo({ lineUserId: actorId }),
        WEBHOOK_EXTERNAL_TIMEOUT_MS,
        "notion_fetch"
      );
      notionText = notionData.content || "";
      customPrompt = notionData.promptFromNotion || "";
      if (!notionText.trim()) {
        noMemoNotice = "本日更新のNotionメモが見つからなかったため、テンプレートを返します。";
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "notion_fetch_failed";
      noMemoNotice = `Notion取得に失敗したためテンプレートを返します。(${reason})`;
    }

    let draftText = "";
    try {
      draftText = await withTimeout(
        generateDraftWithGemini({ notionText, customPrompt }),
        WEBHOOK_EXTERNAL_TIMEOUT_MS,
        "gemini_generate"
      );
    } catch {
      draftText = buildFallbackDraft(notionText);
    }

    setPendingDraft({
      lineUserId: actorId,
      draftText,
      notionSummary: notionText.slice(0, 500),
    });

    const responseText = [
      "日報ドラフトを作成しました。必要な箇所を修正して、そのまま返信すると確定版として転送します。",
      noMemoNotice,
      "",
      draftText,
    ]
      .filter(Boolean)
      .join("\n");
    await replyLineMessage(replyToken, responseText);
    return { status: "draft_generated" as const };
  }

  const pending = getPendingDraft(actorId);
  if (!pending) {
    await replyLineMessage(
      replyToken,
      "確定対象の下書きが見つかりません。「日報作成」と送ると最新メモからドラフトを作成します。"
    );
    return { status: "skipped" as const, reason: "pending_draft_not_found" };
  }

  const clerkUserId = resolveClerkUserId(request);

  let preferredType: LineRecipientType =
    (process.env.LINE_FORWARD_PREFERRED_TYPE || "group").trim() === "user" ? "user" : "group";
  if (lineUserId) {
    try {
      const setting = await getLatestLineUserSetting(lineUserId);
      if (setting) {
        preferredType = setting.forwardType;
      }
    } catch (error) {
      console.error(
        `${WEBHOOK_LOG_PREFIX} user setting fetch failed`,
        JSON.stringify({
          lineUserId,
          message: error instanceof Error ? error.message : "unknown",
        })
      );
    }
  }

  const memberLinkedTarget = lineUserId
    ? await getLatestActiveMemberLink(lineUserId)
    : null;
  const dynamicTarget = memberLinkedTarget
    ? {
        lineId: memberLinkedTarget.targetLineId,
        recipientType: memberLinkedTarget.targetRecipientType,
      }
    : clerkUserId
      ? await resolveDynamicForwardTargetWithType(clerkUserId, preferredType)
      : null;
  const fallbackTarget =
    normalizeEnvValue(process.env.LINE_FINAL_TARGET_ID) ||
    normalizeEnvValue(process.env.LINE_USER_ID);
  const forwardTo = dynamicTarget?.lineId || fallbackTarget;
  if (!forwardTo) {
    await replyLineMessage(
      replyToken,
      "転送先が未設定です。上司は `部下招待`、部下は `連携 <コード>` を実行してください。"
    );
    return { status: "skipped" as const, reason: "forward_target_missing" };
  }
  if (lineUserId && forwardTo === lineUserId) {
    await replyLineMessage(
      replyToken,
      "現在の連携先が自分自身になっています。上司側で `部下招待`、部下側で `連携 <コード>` を再実行してください。"
    );
    return { status: "skipped" as const, reason: "self_forward_blocked" };
  }

  const finalBody = sanitizeFinalReportText(text);
  if (!finalBody) {
    await replyLineMessage(
      replyToken,
      "本文が空になりました。日報本文だけを貼り付けて再送してください。"
    );
    return { status: "skipped" as const, reason: "final_body_empty" };
  }

  const finalMessage = finalBody;

  let sheetSaved = false;
  let sheetError = "";
  const missingSheetEnv = getMissingReportHistoryEnvVars();
  if (missingSheetEnv.length > 0) {
    sheetError = `missing_env_vars:${missingSheetEnv.join(",")}`;
    console.error(
      `${WEBHOOK_LOG_PREFIX} sheet save skipped`,
      JSON.stringify({ actorId, reason: sheetError })
    );
  } else {
    try {
      await withTimeout(
        appendReportHistory({
          sentAt: toJstIsoString(),
          toolName: `LINEトーク / Notion / LINE(${dynamicTarget?.recipientType || "fallback"})`,
          checklistSummary: `確定版送信 from ${actorId}${clerkUserId ? ` / clerk:${clerkUserId}` : ""}`,
          formattedMessage: finalBody,
          dataDestination: "Notion",
          reportDestination: "LINE",
          senderName: actorId,
          mode: "low",
          userId: actorId,
        }),
        WEBHOOK_EXTERNAL_TIMEOUT_MS,
        "sheet_append"
      );
      sheetSaved = true;
    } catch (error) {
      sheetError = error instanceof Error ? error.message : "sheet_save_failed";
      console.error(
        `${WEBHOOK_LOG_PREFIX} sheet save failed`,
        JSON.stringify({ actorId, message: sheetError })
      );
    }
  }

  await withTimeout(
    notifyToLine({ to: forwardTo, message: finalMessage }),
    WEBHOOK_EXTERNAL_TIMEOUT_MS,
    "line_forward"
  );
  clearPendingDraft(actorId);
  await replyLineMessage(
    replyToken,
    sheetSaved
      ? "確定版を転送し、履歴をスプレッドシートに保存しました。再度作成する場合は「日報作成」と送ってください。"
      : `確定版を転送しました。スプレッドシート保存は失敗しました（${sheetError || "unknown"}）。`
  );
  return { status: "final_forwarded" as const };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") || "";
  console.log(
    `${WEBHOOK_LOG_PREFIX} request received`,
    JSON.stringify({
      bodySize: rawBody.length,
      hasSignature: Boolean(signature),
    })
  );
  const summary: ProcessSummary = {
    linked: 0,
    draftsGenerated: 0,
    finalsForwarded: 0,
    skipped: 0,
    eventErrors: [],
  };

  if (!signature || !isValidLineSignature(rawBody, signature)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_signature",
        missing: !process.env.LINE_CHANNEL_SECRET ? ["LINE_CHANNEL_SECRET"] : [],
      },
      { status: 401 }
    );
  }

  let parsedBody: LineWebhookBody;
  try {
    parsedBody = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const events = Array.isArray(parsedBody.events) ? parsedBody.events : [];
  console.log(
    `${WEBHOOK_LOG_PREFIX} parsed events`,
    JSON.stringify({ count: events.length })
  );
  for (const [index, event] of events.entries()) {
    try {
      console.log(
        `${WEBHOOK_LOG_PREFIX} processing event`,
        JSON.stringify({
          index,
          type: event.type || "unknown",
          sourceType: event.source?.type || "unknown",
          messageType: event.message?.type || "none",
        })
      );
      if (event.type === "follow" || event.type === "join") {
        const result = await handleLinkEvent(event, request);
        if (result.linked) {
          summary.linked += 1;
        } else {
          summary.skipped += 1;
          summary.eventErrors.push({
            index,
            type: event.type || "unknown",
            reason: result.reason,
          });
        }
        continue;
      }

      if (event.type === "message" && event.message?.type === "text") {
        const result = await handleMessageEvent(event, request);
        if (result.status === "draft_generated") {
          summary.draftsGenerated += 1;
        } else if (result.status === "final_forwarded") {
          summary.finalsForwarded += 1;
        } else {
          summary.skipped += 1;
          summary.eventErrors.push({
            index,
            type: event.type || "unknown",
            reason: result.reason,
          });
        }
        continue;
      }

      summary.skipped += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "event_process_failed";
      console.error(
        `${WEBHOOK_LOG_PREFIX} event error`,
        JSON.stringify({
          index,
          type: event.type || "unknown",
          reason,
        })
      );
      summary.eventErrors.push({
        index,
        type: event.type || "unknown",
        reason,
      });

      if (event.type === "message" && event.message?.type === "text" && event.replyToken) {
        try {
          await replyLineMessage(
            event.replyToken,
            "処理中にエラーが発生しました。テンプレートで再実行します。もう一度「日報作成」と送信してください。"
          );
        } catch (replyError) {
          console.error(
            `${WEBHOOK_LOG_PREFIX} fallback reply failed`,
            JSON.stringify({
              index,
              message:
                replyError instanceof Error ? replyError.message : "unknown",
            })
          );
        }
      }
    }
  }

  console.log(`${WEBHOOK_LOG_PREFIX} completed`, JSON.stringify(summary));
  return NextResponse.json({
    ok: summary.eventErrors.length === 0,
    processed: events.length,
    ...summary,
  });
}
