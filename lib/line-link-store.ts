import { google } from "googleapis";

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
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

export function getMissingLineLinkEnvVars() {
  const required = ["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY"] as const;
  const missing: string[] = required.filter((key) => !process.env[key]);
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

  if (filtered.length === 0) {
    return null;
  }

  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return filtered[0];
}
