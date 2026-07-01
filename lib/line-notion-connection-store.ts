import crypto from "node:crypto";
import { google } from "googleapis";
import { normalizeEnvValue, normalizeMultilineEnvValue } from "@/lib/env-utils";

export type LineNotionConnectionRecord = {
  createdAt: string;
  lineUserId: string;
  status: "active" | "inactive";
  workspaceId: string;
  workspaceName: string;
  accessToken: string;
  botId: string;
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
  return (process.env.GOOGLE_LINE_NOTION_CONNECTION_SHEET_NAME || "line_notion_connections").trim();
}

function getCipherSecret() {
  return (
    normalizeEnvValue(process.env.NOTION_TOKEN_ENCRYPTION_SECRET) ||
    normalizeEnvValue(process.env.LINE_CHANNEL_SECRET)
  );
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

function createCipherKey() {
  const secret = getCipherSecret();
  if (!secret) {
    throw new Error("missing_env_var:NOTION_TOKEN_ENCRYPTION_SECRET_OR_LINE_CHANNEL_SECRET");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptAccessToken(token: string) {
  const key = createCipherKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${encrypted.toString("base64url")}:${tag.toString("base64url")}`;
}

function decryptAccessToken(cipherText: string) {
  if (!cipherText.startsWith("v1:")) {
    // backward-compat fallback
    return cipherText;
  }
  const [, ivRaw, encryptedRaw, tagRaw] = cipherText.split(":");
  const key = createCipherKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}

export function getMissingLineNotionConnectionEnvVars() {
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
  if (!getCipherSecret()) {
    missing.push("NOTION_TOKEN_ENCRYPTION_SECRET or LINE_CHANNEL_SECRET");
  }
  return missing;
}

export async function appendLineNotionConnectionRecord(record: LineNotionConnectionRecord) {
  const sheets = createSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:I`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          record.createdAt,
          record.lineUserId,
          record.status,
          record.workspaceId,
          record.workspaceName,
          encryptAccessToken(record.accessToken),
          record.botId,
          record.updatedBy,
          record.note,
        ],
      ],
    },
  });
}

export async function getLatestLineNotionConnection(lineUserId: string) {
  const normalizedUserId = lineUserId.trim();
  if (!normalizedUserId) return null;

  const sheets = createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:I`,
  });
  const rows = response.data.values ?? [];
  const records = rows
    .filter((row) => (row[1] || "").trim() === normalizedUserId)
    .map((row) => ({
      createdAt: row[0] || "",
      lineUserId: row[1] || "",
      status: row[2] === "inactive" ? "inactive" : "active",
      workspaceId: row[3] || "",
      workspaceName: row[4] || "",
      accessTokenEncrypted: row[5] || "",
      botId: row[6] || "",
      updatedBy: row[7] || "",
      note: row[8] || "",
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const latest = records[0];
  if (!latest) return null;
  const accessToken = latest.accessTokenEncrypted
    ? decryptAccessToken(latest.accessTokenEncrypted)
    : "";
  return {
    createdAt: latest.createdAt,
    lineUserId: latest.lineUserId,
    status: latest.status as "active" | "inactive",
    workspaceId: latest.workspaceId,
    workspaceName: latest.workspaceName,
    accessToken,
    botId: latest.botId,
    updatedBy: latest.updatedBy,
    note: latest.note,
  };
}

export async function getLatestActiveLineNotionConnection(lineUserId: string) {
  const latest = await getLatestLineNotionConnection(lineUserId);
  if (!latest || latest.status !== "active" || !latest.accessToken) return null;
  return latest;
}
