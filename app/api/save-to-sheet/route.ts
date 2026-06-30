import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getLatestLineLinkRecord, type LineRecipientType } from "@/lib/line-link-store";
import { getMissingNotifierEnvVars, notifyToLine } from "@/lib/notifiers";
import {
  appendReportHistory,
  getMissingReportHistoryEnvVars,
} from "@/lib/report-history-store";

type ChecklistState = {
  id: string;
  label: string;
  checked: boolean;
};

type SaveToSheetBody = {
  sentAt?: string;
  toolName?: string;
  senderName?: string;
  mode?: "high" | "medium" | "low";
  dataDestination?: string;
  reportDestination?: string;
  checklistStates?: ChecklistState[];
  formattedMessage?: string;
  lineRecipientType?: LineRecipientType;
};

function getMissingEnvVars() {
  const missing: string[] = [...getMissingReportHistoryEnvVars()];
  missing.push(...getMissingNotifierEnvVars());
  return missing;
}

function formatChecklistStates(states: ChecklistState[]) {
  return states
    .map((item) => `${item.checked ? "ON" : "OFF"}: ${item.label}`)
    .join("\n");
}

export async function POST(request: Request) {
  try {
    const missing = getMissingEnvVars();
    if (missing.length > 0) {
      return NextResponse.json(
        { ok: false, error: "missing_env_vars", missing },
        { status: 500 }
      );
    }

    const body = (await request.json()) as SaveToSheetBody;
    const { userId } = await auth();
    const sentAt = body.sentAt || new Date().toISOString();
    const toolName = body.toolName?.trim() || "未指定";
    const senderName = body.senderName?.trim() || "未設定";
    const mode = body.mode === "medium" || body.mode === "low" ? body.mode : "high";
    const dataDestination = body.dataDestination?.trim() || "未設定";
    const reportDestination = body.reportDestination?.trim() || "未設定";
    const formattedMessage = body.formattedMessage?.trim() || "";
    const lineRecipientType: LineRecipientType =
      body.lineRecipientType === "group" ? "group" : "user";
    const checklistStates = Array.isArray(body.checklistStates)
      ? body.checklistStates
      : [];

    if (!formattedMessage) {
      return NextResponse.json(
        { ok: false, error: "formatted_message_required" },
        { status: 400 }
      );
    }

    await appendReportHistory({
      sentAt,
      toolName: `${toolName} / ${dataDestination} / ${reportDestination}`,
      checklistSummary: formatChecklistStates(checklistStates),
      formattedMessage,
      dataDestination,
      reportDestination,
      senderName,
      mode,
      userId: userId || "",
    });

    let lineTargetId = process.env.LINE_USER_ID || "";
    if (userId) {
      const linkedRecord = await getLatestLineLinkRecord(userId);
      if (linkedRecord && linkedRecord.recipientType === lineRecipientType) {
        lineTargetId = linkedRecord.lineId;
      }
    }

    if (!lineTargetId) {
      return NextResponse.json(
        {
          ok: false,
          error: "line_target_not_linked",
          sheetSaved: true,
          message:
            "LINE送信先が未設定です。管理画面で送信先を選択し、Bot友だち追加またはグループ招待を完了してください。",
        },
        { status: 400 }
      );
    }

    try {
      await notifyToLine({ to: lineTargetId, message: formattedMessage });
    } catch (lineError) {
      console.error("LINE送信に失敗しました（スプレッドシート保存は成功）", lineError);
      return NextResponse.json(
        {
          ok: false,
          error: "line_send_failed",
          sheetSaved: true,
          message:
            lineError instanceof Error ? lineError.message : "Unknown LINE error",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, sheetSaved: true, lineSent: true });
  } catch (error) {
    console.error("スプレッドシート保存処理に失敗しました", error);
    return NextResponse.json(
      {
        ok: false,
        error: "save_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

