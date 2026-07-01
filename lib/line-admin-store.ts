import { google } from "googleapis";
import { normalizeEnvValue, normalizeMultilineEnvValue } from "@/lib/env-utils";

export type LineAdminRecord = {
  createdAt: string;
  lineUserId: string;
  status: "active" | "inactive";
  updatedBy: string;
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
  return (process.env.GOOGLE_LINE_ADMIN_SHEET_NAME || "line_admins").trim();
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

export function getMissingLineAdminEnvVars() {
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

export async function appendLineAdminRecord(record: LineAdminRecord) {
  const sheets = createSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:D`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[record.createdAt, record.lineUserId, record.status, record.updatedBy]],
    },
  });
}

export async function getActiveLineAdminIds() {
  const sheets = createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:D`,
  });
  const rows = response.data.values ?? [];
  const latestByUser = new Map<string, LineAdminRecord>();

  rows.forEach((row) => {
    const lineUserId = (row[1] || "").trim();
    if (!lineUserId) return;
    const record: LineAdminRecord = {
      createdAt: row[0] || "",
      lineUserId,
      status: row[2] === "inactive" ? "inactive" : "active",
      updatedBy: row[3] || "",
    };
    const prev = latestByUser.get(lineUserId);
    if (!prev || prev.createdAt.localeCompare(record.createdAt) < 0) {
      latestByUser.set(lineUserId, record);
    }
  });

  return Array.from(latestByUser.values())
    .filter((record) => record.status === "active")
    .map((record) => record.lineUserId);
}

