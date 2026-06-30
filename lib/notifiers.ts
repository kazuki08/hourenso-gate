import { normalizeEnvValue } from "@/lib/env-utils";

export type NotificationChannel = "line" | "slack" | "sms";

type NotifyToLineParams = {
  to: string;
  message: string;
  token?: string;
};

type NotifyStubParams = {
  message: string;
  to?: string;
};

export function getMissingNotifierEnvVars() {
  const missing: string[] = [];
  if (!normalizeEnvValue(process.env.LINE_CHANNEL_ACCESS_TOKEN)) {
    missing.push("LINE_CHANNEL_ACCESS_TOKEN");
  }
  return missing;
}

export async function notifyToLine(params: NotifyToLineParams) {
  const token = normalizeEnvValue(
    params.token || process.env.LINE_CHANNEL_ACCESS_TOKEN || ""
  );
  if (!token) {
    throw new Error("missing_env_var:LINE_CHANNEL_ACCESS_TOKEN");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: params.to,
      messages: [{ type: "text", text: params.message }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE push failed: ${response.status} ${detail}`);
  }
}

export async function notifyToSlack(params: NotifyStubParams) {
  void params;
  // TODO(phase2): Slack通知実装時にWebhook/Token送信へ差し替える
  return { ok: false, reason: "not_implemented_phase1" as const };
}

export async function notifyToSms(params: NotifyStubParams) {
  void params;
  // TODO(phase2): SMS通知実装時にプロバイダー連携へ差し替える
  return { ok: false, reason: "not_implemented_phase1" as const };
}

export async function notifyByChannel(params: {
  channel: NotificationChannel;
  message: string;
  to?: string;
}) {
  if (params.channel === "line") {
    if (!params.to) {
      throw new Error("line_target_required");
    }
    await notifyToLine({ to: params.to, message: params.message });
    return { ok: true, channel: "line" as const };
  }

  if (params.channel === "slack") {
    return notifyToSlack({ message: params.message, to: params.to });
  }

  return notifyToSms({ message: params.message, to: params.to });
}
