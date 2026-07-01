import { auth } from "@clerk/nextjs/server";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import {
  normalizeEnvValue,
  normalizeMultilineEnvValue,
  toJstIsoString,
} from "@/lib/env-utils";

type HistoryItem = {
  id: string;
  sentAt: string;
  senderName: string;
  mode: "high" | "medium" | "low";
  message: string;
  userId: string;
};

function getMissingEnvVars() {
  const missing: string[] = [];
  if (!normalizeEnvValue(process.env.GOOGLE_CLIENT_EMAIL)) {
    missing.push("GOOGLE_CLIENT_EMAIL");
  }
  if (!normalizeMultilineEnvValue(process.env.GOOGLE_PRIVATE_KEY)) {
    missing.push("GOOGLE_PRIVATE_KEY");
  }
  const spreadsheetId =
    process.env.NEXT_PUBLIC_SPREADSHEET_ID ||
    process.env.NEXT_PUBLIC_DEFAULT_SPREADSHEET_ID ||
    process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    missing.push("NEXT_PUBLIC_SPREADSHEET_ID");
  }
  return missing;
}

function normalizeMode(value: string): "high" | "medium" | "low" {
  if (value === "medium" || value === "low") {
    return value;
  }
  return "high";
}

function parseTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeHistoryUserId(raw: string) {
  const normalized = raw.trim();
  if (!normalized) {
    return "";
  }
  if (["null", "undefined", "-", "なし"].includes(normalized.toLowerCase())) {
    return "";
  }
  return normalized;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "missing_env_vars", missing },
      { status: 500 }
    );
  }

  try {
    const email = normalizeEnvValue(process.env.GOOGLE_CLIENT_EMAIL);
    const key = normalizeMultilineEnvValue(process.env.GOOGLE_PRIVATE_KEY);
    const googleAuth = new google.auth.JWT({
      email,
      key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth: googleAuth });
    const spreadsheetId =
      process.env.NEXT_PUBLIC_SPREADSHEET_ID ||
      process.env.NEXT_PUBLIC_DEFAULT_SPREADSHEET_ID ||
      process.env.GOOGLE_SPREADSHEET_ID;
    const sheetName = (process.env.GOOGLE_SHEET_NAME || "シート1").trim();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:I`,
    });
    const rows = response.data.values ?? [];

    const items: HistoryItem[] = rows
      .map((row, index) => {
        const sentAt = String(row[0] || "");
        const message = String(row[3] || "");
        if (!sentAt && !message) {
          return null;
        }

        return {
          id: `${sentAt || "unknown"}-${index}`,
          sentAt: sentAt || toJstIsoString(0),
          senderName: String(row[6] || "未設定"),
          mode: normalizeMode(String(row[7] || "")),
          message: message || "（報告内容なし）",
          userId: normalizeHistoryUserId(String(row[8] || "")),
        };
      })
      .filter((item): item is HistoryItem => item !== null)
      .sort((a, b) => parseTimestamp(b.sentAt) - parseTimestamp(a.sentAt));

    return NextResponse.json({ ok: true, items, currentUserId: userId });
  } catch (error) {
    console.error("履歴取得に失敗しました", error);
    return NextResponse.json(
      {
        ok: false,
        error: "history_read_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
