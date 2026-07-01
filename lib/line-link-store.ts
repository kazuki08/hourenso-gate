import { google } from "googleapis";
import { normalizeEnvValue, normalizeMultilineEnvValue } from "@/lib/env-utils";

export type LineRecipientType = "user" | "group";

export type LineLinkRecord = {
  createdAt: string;
  clerkUserId: string;
  recipientType: LineRecipientType;
  lineId: string;
  eventType: string;
};

function getSpreadsheetId() {
  return (
    process.env.NEXT_PUBLIC_SPREADSHEET_ID ||
    process.env.NEXT_PUBLIC_DEFAULT_SPREADSHEET_ID ||
    process.env.GOOGLE_SPREADSHEET_ID ||
    ""
  );
}

function getLineLinkSheetName() {
  return (process.env.GOOGLE_LINE_LINK_SHEET_NAME || "line_links").trim();
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

export function getMissingLineLinkEnvVars() {
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

export async function appendLineLinkRecord(
  record: LineLinkRecord,
  rawSourceJson: string
) {
  const sheets = createSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getLineLinkSheetName();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:G`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          record.createdAt,
          record.clerkUserId,
          record.recipientType,
          record.lineId,
          record.eventType,
          rawSourceJson,
          "linked",
        ],
      ],
    },
  });
}

export async function getLatestLineLinkRecord(clerkUserId: string) {
  const filtered = await getLineLinkRecords(clerkUserId);
  if (filtered.length === 0) {
    return null;
  }
  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return filtered[0];
}

export async function getLatestLineLinkRecordByType(
  clerkUserId: string,
  recipientType: LineRecipientType
) {
  const filtered = await getLineLinkRecords(clerkUserId);
  const typed = filtered.filter((row) => row.recipientType === recipientType);
  if (typed.length === 0) {
    return null;
  }
  typed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return typed[0];
}

async function getLineLinkRecords(clerkUserId: string) {
  const sheets = createSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getLineLinkSheetName();

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:G`,
  });

  const rows = result.data.values ?? [];
  const filtered = rows
    .filter((row) => row[1] === clerkUserId)
    .map((row) => ({
      createdAt: row[0] || "",
      clerkUserId: row[1] || "",
      recipientType: (row[2] || "") as LineRecipientType,
      lineId: row[3] || "",
      eventType: row[4] || "",
    }))
    .filter(
      (row) =>
        (row.recipientType === "user" || row.recipientType === "group") &&
        row.lineId !== ""
    );

  return filtered;
}
