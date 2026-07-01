import { google } from "googleapis";
import { normalizeEnvValue, normalizeMultilineEnvValue } from "@/lib/env-utils";

export type LineNotionDailyDbRecord = {
  createdAt: string;
  lineUserId: string;
  databaseId: string;
  status: "active" | "inactive";
  updatedBy: string;
  note: string;
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
  return (process.env.GOOGLE_LINE_NOTION_DAILY_DB_SHEET_NAME || "line_notion_daily_dbs").trim();
}

function createSheetsClient() {
  const email = normalizeEnvValue(process.env.GOOGLE_CLIENT_EMAIL);
  const key = normalizeMultilineEnvValue(process.env.GOOGLE_PRIVATE_KEY);
  if (!email || !key) {
    throw new Error("google_credentials_not_configured");
  }
  if (!key.includes("BEGIN PRIVATE KEY") || !key.includes("END PRIVATE KEY")) {
    throw new Error("google_private_key_format_invalid");
  }
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export function getMissingLineNotionDailyDbEnvVars() {
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

export async function appendLineNotionDailyDbRecord(record: LineNotionDailyDbRecord) {
  const sheets = createSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:F`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          record.createdAt,
          record.lineUserId,
          record.databaseId,
          record.status,
          record.updatedBy,
          record.note,
        ],
      ],
    },
  });
}

export async function getLatestLineNotionDailyDb(lineUserId: string) {
  const normalizedUserId = lineUserId.trim();
  if (!normalizedUserId) return null;

  const sheets = createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:F`,
  });
  const rows = response.data.values ?? [];
  const records = rows
    .filter((row) => (row[1] || "").trim() === normalizedUserId)
    .map((row) => ({
      createdAt: row[0] || "",
      lineUserId: row[1] || "",
      databaseId: row[2] || "",
      status: row[3] === "inactive" ? "inactive" : "active",
      updatedBy: row[4] || "",
      note: row[5] || "",
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return records[0] || null;
}

export async function getLatestActiveLineNotionDailyDb(lineUserId: string) {
  const latest = await getLatestLineNotionDailyDb(lineUserId);
  if (!latest || latest.status !== "active" || !latest.databaseId) return null;
  return latest;
}
