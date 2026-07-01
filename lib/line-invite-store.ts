import { google } from "googleapis";
import { normalizeEnvValue, normalizeMultilineEnvValue } from "@/lib/env-utils";
import type { LineRecipientType } from "@/lib/line-link-store";

export type LineInviteRecord = {
  createdAt: string;
  inviteCode: string;
  targetLineId: string;
  targetRecipientType: LineRecipientType;
  createdByLineUserId: string;
  expiresAt: string;
  status: "active" | "used" | "revoked";
  usedByLineUserId: string;
  usedAt: string;
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
  return (process.env.GOOGLE_LINE_INVITE_SHEET_NAME || "line_invites").trim();
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

export function getMissingLineInviteEnvVars() {
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

function toRecord(row: string[]): LineInviteRecord | null {
  const targetRecipientType = row[3] === "group" ? "group" : row[3] === "user" ? "user" : "";
  const status = row[6] as LineInviteRecord["status"];
  if (!targetRecipientType || (status !== "active" && status !== "used" && status !== "revoked")) {
    return null;
  }
  return {
    createdAt: row[0] || "",
    inviteCode: (row[1] || "").toUpperCase(),
    targetLineId: row[2] || "",
    targetRecipientType,
    createdByLineUserId: row[4] || "",
    expiresAt: row[5] || "",
    status,
    usedByLineUserId: row[7] || "",
    usedAt: row[8] || "",
  };
}

export async function appendLineInviteRecord(record: LineInviteRecord) {
  const sheets = createSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:I`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          record.createdAt,
          record.inviteCode,
          record.targetLineId,
          record.targetRecipientType,
          record.createdByLineUserId,
          record.expiresAt,
          record.status,
          record.usedByLineUserId,
          record.usedAt,
        ],
      ],
    },
  });
}

export async function getLatestInviteByCode(inviteCode: string) {
  const normalizedCode = inviteCode.trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }
  const sheets = createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:I`,
  });
  const rows = response.data.values ?? [];
  const records = rows
    .map((row) => toRecord(row))
    .filter((row): row is LineInviteRecord => row !== null)
    .filter((row) => row.inviteCode === normalizedCode)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return records[0] || null;
}
