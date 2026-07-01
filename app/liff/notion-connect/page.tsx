import NotionConnectClient from "./notion-connect-client";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function multiDecode(value: string) {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function extractAuthFromLiffState(rawState: string) {
  if (!rawState) return "";
  const decoded = multiDecode(rawState);

  // Case 1: "auth=..." or "?auth=..."
  const directQuery = decoded.startsWith("?") ? decoded.slice(1) : decoded;
  const directValue = new URLSearchParams(directQuery).get("auth");
  if (directValue) return multiDecode(directValue);

  // Case 2: "/liff/notion-connect?auth=..."
  const questionIndex = decoded.indexOf("?");
  if (questionIndex >= 0) {
    const fromPathQuery = new URLSearchParams(decoded.slice(questionIndex + 1)).get("auth");
    if (fromPathQuery) return multiDecode(fromPathQuery);
  }

  // Case 3: full URL ".../liff/notion-connect?auth=..."
  try {
    const fromAbsoluteUrl = new URL(decoded).searchParams.get("auth");
    if (fromAbsoluteUrl) return multiDecode(fromAbsoluteUrl);
  } catch {
    // ignore parse error and return empty
  }
  return "";
}

export default async function LiffNotionConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const directAuth = firstParam(params.auth);
  const liffState = firstParam(params["liff.state"]);
  const raw = directAuth || extractAuthFromLiffState(liffState);
  let authUrl = "";
  let liffId = "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:") {
      authUrl = parsed.toString();
    }
  } catch {
    authUrl = "";
  }

  try {
    const liffRaw = process.env.NEXT_PUBLIC_LIFF_NOTION_CONNECT_URL || "";
    const liffUrl = new URL(liffRaw);
    if (liffUrl.hostname === "liff.line.me") {
      liffId = liffUrl.pathname.replace(/^\/+/, "").split("/")[0] || "";
    }
  } catch {
    liffId = "";
  }

  return <NotionConnectClient authUrl={authUrl} liffId={liffId} />;
}
