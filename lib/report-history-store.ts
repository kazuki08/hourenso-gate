import { google } from "googleapis";
import { normalizeEnvValue, normalizeMultilineEnvValue } from "@/lib/env-utils";

export type ReportHistoryPayload = {
  sentAt: string;
  toolName: string;
  checklistSummary: string;
  formattedMessage: string;
  dataDestination: string;
  reportDestination: string;
  senderName: string;
  mode: "high" | "medium" | "low";
  userId: string;
};

function getSpreadsheetId() {
  return (
    process.env.NEXT_PUBLIC_SPREADSHEET_ID ||
    process.env.NEXT_PUBLIC_DEFAULT_SPREADSHEET_ID ||
    process.env.GOOGLE_SPREADSHEET_ID ||
    ""
  );
}

function getSheetName() {
  return (process.env.GOOGLE_SHEET_NAME || "シート1").trim();
}

export function getMissingReportHistoryEnvVars() {
  const required = ["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY"] as const;
  const missing: string[] = [];
  if (!normalizeEnvValue(process.env.GOOGLE_CLIENT_EMAIL)) {
    missing.push("GOOGLE_CLIENT_EMAIL");
  }
  if (!normalizeMultilineEnvValue(process.env.GOOGLE_PRIVATE_KEY)) {
    missing.push("GOOGLE_PRIVATE_KEY");
  }
  if (!getSpreadsheetId()) {
    missing.push("NEXT_PUBLIC_SPREADSHEET_ID");
  }
  return missing;
}

function createSheetsClient() {
  const email = normalizeEnvValue(process.env.GOOGLE_CLIENT_EMAIL);
  const key = normalizeMultilineEnvValue(process.env.GOOGLE_PRIVATE_KEY);
  if (!email || !key) {
    throw new Error("google_credentials_not_configured");
  }
  const hasBegin = key.includes("BEGIN PRIVATE KEY");
  const hasEnd = key.includes("END PRIVATE KEY");
  if (!hasBegin || !hasEnd) {
    console.error(
      "[Sheets] GOOGLE_PRIVATE_KEY format invalid",
      JSON.stringify({
        keyLength: key.length,
        hasBegin,
        hasEnd,
      })
    );
    throw new Error("google_private_key_format_invalid");
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export async function appendReportHistory(payload: ReportHistoryPayload) {
  const sheets = createSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:I`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          payload.sentAt,
          payload.toolName,
          payload.checklistSummary,
          payload.formattedMessage,
          payload.dataDestination,
          payload.reportDestination,
          payload.senderName,
          payload.mode,
          payload.userId,
        ],
      ],
    },
  });
}
