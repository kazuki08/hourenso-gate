import { google } from "googleapis";
import { NextResponse } from "next/server";

type ChecklistState = {
  id: string;
  label: string;
  checked: boolean;
};

type SaveToSheetBody = {
  sentAt?: string;
  toolName?: string;
  dataDestination?: string;
  reportDestination?: string;
  checklistStates?: ChecklistState[];
  formattedMessage?: string;
};

function getMissingEnvVars() {
  const required = [
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "LINE_CHANNEL_ACCESS_TOKEN",
    "LINE_USER_ID",
  ] as const;
  const missing: string[] = required.filter((key) => !process.env[key]);
  const spreadsheetId =
    process.env.NEXT_PUBLIC_SPREADSHEET_ID ||
    process.env.NEXT_PUBLIC_DEFAULT_SPREADSHEET_ID ||
    process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    missing.push("NEXT_PUBLIC_SPREADSHEET_ID");
  }
  return missing;
}

function formatChecklistStates(states: ChecklistState[]) {
  return states
    .map((item) => `${item.checked ? "ON" : "OFF"}: ${item.label}`)
    .join("\n");
}

async function sendLineMessage(message: string) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: process.env.LINE_USER_ID,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE push failed: ${response.status} ${detail}`);
  }
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
    const sentAt = body.sentAt || new Date().toISOString();
    const toolName = body.toolName?.trim() || "未指定";
    const dataDestination = body.dataDestination?.trim() || "未設定";
    const reportDestination = body.reportDestination?.trim() || "未設定";
    const formattedMessage = body.formattedMessage?.trim() || "";
    const checklistStates = Array.isArray(body.checklistStates)
      ? body.checklistStates
      : [];

    if (!formattedMessage) {
      return NextResponse.json(
        { ok: false, error: "formatted_message_required" },
        { status: 400 }
      );
    }

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId =
      process.env.NEXT_PUBLIC_SPREADSHEET_ID ||
      process.env.NEXT_PUBLIC_DEFAULT_SPREADSHEET_ID ||
      process.env.GOOGLE_SPREADSHEET_ID;
    const sheetName = (process.env.GOOGLE_SHEET_NAME || "シート1").trim();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:F`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            sentAt,
            `${toolName} / ${dataDestination} / ${reportDestination}`,
            formatChecklistStates(checklistStates),
            formattedMessage,
            dataDestination,
            reportDestination,
          ],
        ],
      },
    });

    try {
      await sendLineMessage(formattedMessage);
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

