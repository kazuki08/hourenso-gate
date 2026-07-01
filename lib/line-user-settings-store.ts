import { google } from "googleapis";
import { normalizeEnvValue, normalizeMultilineEnvValue } from "@/lib/env-utils";
import type { LineRecipientType } from "@/lib/line-link-store";

export type LineForwardType = LineRecipientType;

export type LineUserSettingRecord = {
  createdAt: string;
  lineUserId: string;
  forwardType: LineForwardType;
  updatedBy: string;
  status: "active";
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
  return (process.env.GOOGLE_LINE_USER_SETTINGS_SHEET_NAME || "line_user_settings").trim();
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

export function getMissingLineUserSettingsEnvVars() {
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

export async function appendLineUserSetting(record: LineUserSettingRecord) {
  const sheets = createSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:E`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [record.createdAt, record.lineUserId, record.forwardType, record.updatedBy, record.status],
      ],
    },
  });
}

export async function getLatestLineUserSetting(lineUserId: string) {
  const sheets = createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:E`,
  });
  const rows = response.data.values ?? [];
  const filtered = rows
    .filter((row) => row[1] === lineUserId && (row[4] || "active") === "active")
    .map((row) => ({
      createdAt: row[0] || "",
      lineUserId: row[1] || "",
      forwardType: (row[2] === "user" ? "user" : "group") as LineForwardType,
      updatedBy: row[3] || "",
      status: "active" as const,
    }));
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return filtered[0];
}
