import crypto from "node:crypto";
import { normalizeEnvValue } from "@/lib/env-utils";

type NotionOAuthStatePayload = {
  lineUserId: string;
  issuedAt: number;
  nonce: string;
};

type NotionOAuthTokenResponse = {
  access_token?: string;
  workspace_name?: string;
  workspace_id?: string;
  bot_id?: string;
  owner?: {
    user?: {
      id?: string;
    };
  };
};

function getStateSecret() {
  return (
    normalizeEnvValue(process.env.NOTION_OAUTH_STATE_SECRET) ||
    normalizeEnvValue(process.env.LINE_CHANNEL_SECRET)
  );
}

function resolveRedirectUri() {
  const raw = normalizeEnvValue(process.env.NOTION_OAUTH_REDIRECT_URI);
  if (!raw) {
    throw new Error("missing_env_var:NOTION_OAUTH_REDIRECT_URI");
  }

  // Recover from malformed values like "/Users/.../https://example.com/callback".
  const httpIndex = raw.indexOf("http://");
  const httpsIndex = raw.indexOf("https://");
  const recoveredIndex =
    httpsIndex >= 0 ? httpsIndex : httpIndex >= 0 ? httpIndex : -1;
  const candidate = recoveredIndex > 0 ? raw.slice(recoveredIndex) : raw;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("invalid_env_var:NOTION_OAUTH_REDIRECT_URI");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("invalid_env_var:NOTION_OAUTH_REDIRECT_URI_PROTOCOL");
  }
  return parsed.toString();
}

export function getMissingNotionOAuthEnvVars() {
  const missing: string[] = [];
  if (!normalizeEnvValue(process.env.NOTION_OAUTH_CLIENT_ID)) {
    missing.push("NOTION_OAUTH_CLIENT_ID");
  }
  if (!normalizeEnvValue(process.env.NOTION_OAUTH_CLIENT_SECRET)) {
    missing.push("NOTION_OAUTH_CLIENT_SECRET");
  }
  if (!normalizeEnvValue(process.env.NOTION_OAUTH_REDIRECT_URI)) {
    missing.push("NOTION_OAUTH_REDIRECT_URI");
  }
  if (!getStateSecret()) {
    missing.push("NOTION_OAUTH_STATE_SECRET or LINE_CHANNEL_SECRET");
  }
  return missing;
}

export function createNotionOAuthState(lineUserId: string) {
  const secret = getStateSecret();
  if (!secret) {
    throw new Error("missing_env_var:NOTION_OAUTH_STATE_SECRET_OR_LINE_CHANNEL_SECRET");
  }
  const payload: NotionOAuthStatePayload = {
    lineUserId,
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function parseNotionOAuthState(state: string) {
  const secret = getStateSecret();
  if (!secret) {
    throw new Error("missing_env_var:NOTION_OAUTH_STATE_SECRET_OR_LINE_CHANNEL_SECRET");
  }
  const [body, sig] = state.split(".");
  if (!body || !sig) {
    throw new Error("invalid_state_format");
  }
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (expected !== sig) {
    throw new Error("invalid_state_signature");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as NotionOAuthStatePayload;
  if (!payload.lineUserId) {
    throw new Error("invalid_state_payload");
  }
  const ageMs = Date.now() - payload.issuedAt;
  if (ageMs > 1000 * 60 * 15) {
    throw new Error("state_expired");
  }
  return payload;
}

export function buildNotionOAuthAuthorizeUrl(state: string) {
  const clientId = normalizeEnvValue(process.env.NOTION_OAUTH_CLIENT_ID);
  if (!clientId) {
    throw new Error("missing_env_var:NOTION_OAUTH_CLIENT_ID_OR_REDIRECT_URI");
  }
  const redirectUri = resolveRedirectUri();
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("owner", "user");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeNotionOAuthCode(code: string) {
  const clientId = normalizeEnvValue(process.env.NOTION_OAUTH_CLIENT_ID);
  const clientSecret = normalizeEnvValue(process.env.NOTION_OAUTH_CLIENT_SECRET);
  const redirectUri = resolveRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("missing_env_var:notion_oauth_credentials");
  }

  const basicToken = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`notion_oauth_token_exchange_failed:${response.status}:${text}`);
  }
  const data = JSON.parse(text) as NotionOAuthTokenResponse;
  const accessToken = (data.access_token || "").trim();
  if (!accessToken) {
    throw new Error("notion_oauth_empty_access_token");
  }
  return {
    accessToken,
    workspaceId: data.workspace_id || "",
    workspaceName: data.workspace_name || "",
    botId: data.bot_id || data.owner?.user?.id || "",
  };
}
