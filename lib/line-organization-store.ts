import { google } from "googleapis";
import { normalizeEnvValue, normalizeMultilineEnvValue } from "@/lib/env-utils";

export type LineOrganizationRecord = {
  createdAt: string;
  lineUserId: string;
  organizationName: string;
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
  return (process.env.GOOGLE_LINE_ORG_SHEET_NAME || "line_orgs").trim();
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

export function getMissingLineOrganizationEnvVars() {
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

export async function appendLineOrganizationRecord(record: LineOrganizationRecord) {
  const sheets = createSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:E`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [record.createdAt, record.lineUserId, record.organizationName, record.status, record.updatedBy],
      ],
    },
  });
}

export async function getLatestActiveOrganizationByLineUserId(lineUserId: string) {
  const normalizedId = lineUserId.trim();
  if (!normalizedId) return null;

  const sheets = createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:E`,
  });
  const rows = response.data.values ?? [];
  const records = rows
    .filter((row) => (row[1] || "") === normalizedId)
    .map((row) => ({
      createdAt: row[0] || "",
      lineUserId: row[1] || "",
      organizationName: row[2] || "",
      status: row[3] === "inactive" ? "inactive" : "active",
      updatedBy: row[4] || "",
    }))
    .filter((row) => row.organizationName.trim() !== "")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const latest = records[0];
  if (!latest || latest.status !== "active") return null;
  return latest;
}
