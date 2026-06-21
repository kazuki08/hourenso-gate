import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  DEFAULT_AI_FORMAT_PROMPT,
  FORMAT_MESSAGE_SYSTEM_PROMPT,
} from "../../../lib/prompts";

type FormatRequestBody = {
  message?: string;
  prompt?: string;
};

function resolvePrompt(prompt: string | undefined) {
  const normalized = prompt?.trim() || "";
  return normalized || DEFAULT_AI_FORMAT_PROMPT;
}

function toKansaiStyle(text: string) {
  return text
    .replace(/です。/g, "やで。")
    .replace(/ます。/g, "ますわ。")
    .replace(/してください/g, "してな");
}

function buildMockFormattedMessage(message: string, prompt: string) {
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return "・本日の対応内容を入力してください。";
  }

  const styleConverted = /関西弁/.test(prompt);
  const mappedLines = lines.map((line) => {
    const base = `・${line}`;
    return styleConverted ? toKansaiStyle(base) : base;
  });

  return [
    "【整形済み報連相】",
    ...mappedLines,
    "",
    styleConverted ? "必要な確認事項：特になしやで。" : "必要な確認事項：特になし",
  ].join("\n");
}

async function generateWithGemini(params: {
  apiKey: string;
  systemPrompt: string;
  message: string;
}) {
  const genAI = new GoogleGenerativeAI(params.apiKey);
  const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash"] as const;
  let lastError: unknown;

  const userPrompt = [
    "以下の報連相の下書きを整形してください。",
    "",
    "【下書き】",
    params.message || "（入力なし）",
  ].join("\n");

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: params.systemPrompt,
      });
      const result = await model.generateContent(userPrompt);
      const response = await result.response;
      const text = response.text().trim();
      if (!text) {
        throw new Error("empty_ai_response");
      }
      return { formattedMessage: text, modelName };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function POST(request: Request) {
  const body = (await request.json()) as FormatRequestBody;
  const message = body.message?.trim() ?? "";
  const systemPrompt = resolvePrompt(body.prompt);

  // モックのため疑似待機し、非同期整形のUXを確認可能にする
  await new Promise((resolve) => setTimeout(resolve, 1800));

  try {
    if (process.env.GEMINI_API_KEY) {
      const aiResult = await generateWithGemini({
        apiKey: process.env.GEMINI_API_KEY,
        systemPrompt,
        message,
      });
      return NextResponse.json({
        formattedMessage: aiResult.formattedMessage,
        promptUsed: systemPrompt,
        model: aiResult.modelName,
      });
    }
  } catch {
    // Gemini失敗時は既存UXを壊さないためモック整形にフォールバック
  }

  const formattedMessage = buildMockFormattedMessage(message, systemPrompt);

  return NextResponse.json({
    formattedMessage,
    promptUsed: systemPrompt || FORMAT_MESSAGE_SYSTEM_PROMPT,
    model: "mock",
  });
}

