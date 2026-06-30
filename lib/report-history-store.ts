import { google } from "googleapis";

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
  const missing: string[] = required.filter((key) => !process.env[key]);
  if (!getSpreadsheetId()) {
    missing.push("NEXT_PUBLIC_SPREADSHEET_ID");
  }
  return missing;
}

function createSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
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
