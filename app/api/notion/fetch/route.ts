import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getMissingNotionPhase1EnvVars,
  getNotionDailyMemo,
} from "@/lib/notion-phase1";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const missing = getMissingNotionPhase1EnvVars();
  if (missing.length > 0) {
    return NextResponse.json({
      ok: true,
      content: "",
      notConfigured: true,
      missing,
    });
  }

  try {
    const data = await getNotionDailyMemo({ notionUserHint: userId });

    return NextResponse.json({
      ok: true,
      content: data.content,
      lineCount: data.content ? data.content.split("\n").length : 0,
      source: data.source,
      pageCount: data.pageCount,
      promptFromNotion: data.promptFromNotion || "",
      note: data.note,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "notion_fetch_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
