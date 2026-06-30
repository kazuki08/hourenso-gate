import crypto from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  appendLineLinkRecord,
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
import { normalizeEnvValue } from "@/lib/env-utils";

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

function isCreateDraftTrigger(text: string) {
  return text.includes("日報作成");
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

  const reqUrl = new URL(request.url);
  const clerkUserId =
    reqUrl.searchParams.get("clerkUserId") ||
    request.headers.get("x-clerk-user-id") ||
    process.env.LINE_DEFAULT_CLERK_USER_ID ||
    "";
  if (!clerkUserId) {
    return { linked: false, reason: "clerk_user_id_missing" };
  }

  const detected = detectRecipient(event.source);
  if (!detected) {
    return { linked: false, reason: "recipient_not_detected" };
  }

  await appendLineLinkRecord(
    {
      createdAt: new Date().toISOString(),
      clerkUserId,
      recipientType: detected.recipientType,
      lineId: detected.lineId,
      eventType: event.type || "unknown",
    },
    JSON.stringify(event.source || {})
  );
  return { linked: true };
}

async function handleMessageEvent(
  event: LineWebhookEvent
): Promise<MessageEventResult> {
  const replyToken = event.replyToken || "";
  const text = event.message?.text?.trim() || "";
  const actorId = getSourceActorId(event.source);
  if (!replyToken || !text || !actorId) {
    return { status: "skipped" as const, reason: "invalid_message_event" };
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

  const forwardTo = process.env.LINE_FINAL_TARGET_ID || process.env.LINE_USER_ID || "";
  if (!forwardTo) {
    await replyLineMessage(
      replyToken,
      "転送先が未設定です。運用者へ `LINE_FINAL_TARGET_ID` または `LINE_USER_ID` の設定を依頼してください。"
    );
    return { status: "skipped" as const, reason: "forward_target_missing" };
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
          sentAt: new Date().toISOString(),
          toolName: "LINEトーク / Notion / LINE",
          checklistSummary: `確定版送信 from ${actorId}`,
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
        const result = await handleMessageEvent(event);
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
