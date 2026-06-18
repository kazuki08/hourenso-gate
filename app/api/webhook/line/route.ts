import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  appendLineLinkRecord,
  getMissingLineLinkEnvVars,
  type LineRecipientType,
} from "@/lib/line-link-store";

type LineWebhookEvent = {
  type?: string;
  source?: {
    type?: "user" | "group" | "room";
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
};

type LineWebhookBody = {
  events?: LineWebhookEvent[];
};

function isValidLineSignature(rawBody: string, signature: string) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  return digest === signature;
}

function detectRecipient(source: LineWebhookEvent["source"]) {
  const candidateId = source?.groupId || source?.userId || source?.roomId || "";
  if (!candidateId) {
    return null;
  }

  let recipientType: LineRecipientType | null = null;
  if (candidateId.startsWith("C")) {
    recipientType = "group";
  } else if (candidateId.startsWith("U")) {
    recipientType = "user";
  }

  if (!recipientType) {
    return null;
  }

  return { lineId: candidateId, recipientType };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") || "";

  if (!signature || !isValidLineSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let parsedBody: LineWebhookBody;
  try {
    parsedBody = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const events = Array.isArray(parsedBody.events) ? parsedBody.events : [];
  const linkableEvents = events.filter(
    (event) => event.type === "join" || event.type === "follow"
  );
  if (linkableEvents.length === 0) {
    return NextResponse.json({ ok: true, linked: 0 });
  }

  const missing = getMissingLineLinkEnvVars();
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "missing_env_vars", missing },
      { status: 500 }
    );
  }

  const reqUrl = new URL(request.url);
  const clerkUserId =
    reqUrl.searchParams.get("clerkUserId") ||
    request.headers.get("x-clerk-user-id") ||
    process.env.LINE_DEFAULT_CLERK_USER_ID ||
    "";

  if (!clerkUserId) {
    return NextResponse.json(
      { ok: false, error: "clerk_user_id_required_for_link" },
      { status: 400 }
    );
  }

  let linkedCount = 0;
  for (const event of linkableEvents) {
    const detected = detectRecipient(event.source);
    if (!detected) {
      continue;
    }

    await appendLineLinkRecord(
      {
        createdAt: new Date().toISOString(),
        clerkUserId,
        recipientType: detected.recipientType,
        lineId: detected.lineId,
        eventType: event.type || "unknown",
      },
      JSON.stringify(event.source || {})
    );
    linkedCount += 1;
  }

  return NextResponse.json({ ok: true, linked: linkedCount });
}
