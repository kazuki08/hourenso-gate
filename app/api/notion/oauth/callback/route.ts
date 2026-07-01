import { NextResponse } from "next/server";
import { notifyToLine } from "@/lib/notifiers";
import { toJstIsoString } from "@/lib/env-utils";
import {
  appendLineNotionConnectionRecord,
  getMissingLineNotionConnectionEnvVars,
} from "@/lib/line-notion-connection-store";
import {
  exchangeNotionOAuthCode,
  getMissingNotionOAuthEnvVars,
  parseNotionOAuthState,
} from "@/lib/notion-oauth";

function html(message: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="font-family: sans-serif; padding: 24px;"><h2>報連相Gate</h2><p>${message}</p><p>この画面を閉じてLINEに戻ってください。</p></body></html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const oauthError = url.searchParams.get("error") || "";

  if (oauthError) {
    return html(`Notion連携がキャンセルされました。(${oauthError})`);
  }

  const missing = [
    ...getMissingNotionOAuthEnvVars(),
    ...getMissingLineNotionConnectionEnvVars(),
  ];
  if (missing.length > 0) {
    return html(`環境変数不足: ${Array.from(new Set(missing)).join(", ")}`);
  }
  if (!code || !state) {
    return html("code/state が不足しています。");
  }

  try {
    const parsed = parseNotionOAuthState(state);
    const token = await exchangeNotionOAuthCode(code);
    await appendLineNotionConnectionRecord({
      createdAt: toJstIsoString(),
      lineUserId: parsed.lineUserId,
      status: "active",
      workspaceId: token.workspaceId,
      workspaceName: token.workspaceName,
      accessToken: token.accessToken,
      botId: token.botId,
      updatedBy: parsed.lineUserId,
      note: "oauth_callback_success",
    });
    await notifyToLine({
      to: parsed.lineUserId,
      message: `Notion連携が完了しました。workspace: ${token.workspaceName || token.workspaceId || "unknown"}`,
    });
    return html("Notion連携が完了しました。");
  } catch (error) {
    return html(
      `Notion連携に失敗しました。${error instanceof Error ? error.message : "unknown"}`
    );
  }
}
