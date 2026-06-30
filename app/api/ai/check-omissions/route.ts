import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

type CheckOmissionsBody = {
  notionText?: string;
  draftText?: string;
};

const SYSTEM_PROMPT =
  "あなたは優秀なマネジメントアシスタントです。ユーザーの『生メモ（Notion）』と『作成中の報告書』を比較し、報告書に書き漏らしている重要な情報（数値、トラブル、未完了タスクなど）があれば指摘してください。もし漏れがなければ『抜け漏れはありません、完璧です！』と返してください。指摘は簡潔に、箇条書きで優しく伝えてください。";

function getMissingEnvVars() {
  const required = ["GEMINI_API_KEY"] as const;
  return required.filter((key) => !process.env[key]);
}

function buildMockOmissionFeedback(notionText: string, draftText: string) {
  if (!notionText) {
    return [
      "Notionメモが未設定のため、抜け漏れの自動判定はスキップしました。",
      "入力内容をそのまま整形します。",
    ].join("\n");
  }

  if (!draftText) {
    return "報告ドラフトが空です。内容を入力してから再度お試しください。";
  }

  return [
    "GEMINI_API_KEY が未設定、または AI 呼び出しに失敗したため簡易チェックのみ実行しました。",
    "・入力内容は取得できています。",
    "・本番利用前に GEMINI_API_KEY を Vercel / .env.local に設定してください。",
  ].join("\n");
}

async function generateOmissionFeedback(params: {
  apiKey: string;
  notionText: string;
  draftText: string;
}) {
  const genAI = new GoogleGenerativeAI(params.apiKey);
  const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash"] as const;
  let lastError: unknown;

  const userPrompt = [
    "以下の2つを比較して、抜け漏れを評価してください。",
    "",
    "【生メモ（Notion）】",
    params.notionText,
    "",
    "【作成中の報告書】",
    params.draftText,
  ].join("\n");

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_PROMPT,
      });
      const result = await model.generateContent(userPrompt);
      const response = await result.response;
      const text = response.text().trim();
      if (!text) {
        throw new Error("empty_ai_response");
      }
      return { text, modelName };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CheckOmissionsBody;
    const notionText = body.notionText?.trim() || "";
    const draftText = body.draftText?.trim() || "";

    if (!draftText) {
      return NextResponse.json(
        { ok: false, error: "draft_text_required" },
        { status: 400 }
      );
    }

    if (!notionText) {
      return NextResponse.json({
        ok: true,
        feedback: buildMockOmissionFeedback(notionText, draftText),
        model: "mock",
        skipped: true,
      });
    }

    const missing = getMissingEnvVars();
    if (missing.length > 0) {
      return NextResponse.json({
        ok: true,
        feedback: buildMockOmissionFeedback(notionText, draftText),
        model: "mock",
        notConfigured: true,
        missing,
      });
    }

    try {
      const aiResult = await generateOmissionFeedback({
        apiKey: process.env.GEMINI_API_KEY || "",
        notionText,
        draftText,
      });

      return NextResponse.json({
        ok: true,
        feedback: aiResult.text,
        model: aiResult.modelName,
      });
    } catch (error) {
      return NextResponse.json({
        ok: true,
        feedback: buildMockOmissionFeedback(notionText, draftText),
        model: "mock",
        warning: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_json",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 }
    );
  }
}
