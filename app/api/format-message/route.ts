import { NextResponse } from "next/server";
import { FORMAT_MESSAGE_SYSTEM_PROMPT } from "../../../lib/prompts";

type FormatRequestBody = {
  message?: string;
};

function buildMockFormattedMessage(message: string) {
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return "・本日の対応内容を入力してください。";
  }

  return [
    "【整形済み報連相】",
    ...lines.map((line) => `・${line}`),
    "",
    "必要な確認事項：特になし",
  ].join("\n");
}

export async function POST(request: Request) {
  const body = (await request.json()) as FormatRequestBody;
  const message = body.message?.trim() ?? "";

  // モックのため疑似待機し、非同期整形のUXを確認可能にする
  await new Promise((resolve) => setTimeout(resolve, 1800));

  const formattedMessage = buildMockFormattedMessage(message);

  return NextResponse.json({
    formattedMessage,
    promptUsed: FORMAT_MESSAGE_SYSTEM_PROMPT,
  });
}

