import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getLatestLineLinkRecord,
  getMissingLineLinkEnvVars,
} from "@/lib/line-link-store";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const missing = getMissingLineLinkEnvVars();
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "missing_env_vars", missing },
      { status: 500 }
    );
  }

  try {
    const record = await getLatestLineLinkRecord(userId);
    if (!record) {
      return NextResponse.json({ ok: true, linked: false });
    }

    return NextResponse.json({
      ok: true,
      linked: true,
      lineId: record.lineId,
      recipientType: record.recipientType,
      linkedAt: record.createdAt,
      eventType: record.eventType,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "read_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
