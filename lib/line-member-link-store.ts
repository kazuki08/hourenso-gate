import { google } from "googleapis";
import { normalizeEnvValue, normalizeMultilineEnvValue } from "@/lib/env-utils";
import type { LineRecipientType } from "@/lib/line-link-store";

export type LineMemberLinkRecord = {
  createdAt: string;
  memberLineUserId: string;
  targetLineId: string;
  targetRecipientType: LineRecipientType;
  linkedByLineUserId: string;
  sourceInviteCode: string;
  status: "active" | "inactive";
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
  return (process.env.GOOGLE_LINE_MEMBER_LINK_SHEET_NAME || "line_member_links").trim();
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

export function getMissingLineMemberLinkEnvVars() {
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

export async function appendLineMemberLinkRecord(record: LineMemberLinkRecord) {
  const sheets = createSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:G`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          record.createdAt,
          record.memberLineUserId,
          record.targetLineId,
          record.targetRecipientType,
          record.linkedByLineUserId,
          record.sourceInviteCode,
          record.status,
        ],
      ],
    },
  });
}

export async function getLatestActiveMemberLink(memberLineUserId: string) {
  const latest = await getLatestMemberLink(memberLineUserId);
  if (!latest || latest.status !== "active") {
    return null;
  }
  return latest;
}

export async function getLatestMemberLink(memberLineUserId: string) {
  const normalizedMemberId = memberLineUserId.trim();
  if (!normalizedMemberId) {
    return null;
  }
  const sheets = createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:G`,
  });
  const rows = response.data.values ?? [];
  const records = rows
    .filter((row) => (row[1] || "") === normalizedMemberId)
    .map((row) => ({
      createdAt: row[0] || "",
      memberLineUserId: row[1] || "",
      targetLineId: row[2] || "",
      targetRecipientType: (row[3] === "group" ? "group" : "user") as LineRecipientType,
      linkedByLineUserId: row[4] || "",
      sourceInviteCode: row[5] || "",
      status: (row[6] === "inactive" ? "inactive" : "active") as "active" | "inactive",
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return records[0] || null;
}
