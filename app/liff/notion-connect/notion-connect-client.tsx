"use client";

import { useState } from "react";

function toIntentUrl(url: string) {
  if (!url.startsWith("https://")) return "";
  const withoutScheme = url.slice("https://".length);
  return `intent://${withoutScheme}#Intent;scheme=https;action=android.intent.action.VIEW;end`;
}

export default function NotionConnectClient({ authUrl }: { authUrl: string }) {
  const [copied, setCopied] = useState(false);

  const openExternal = () => {
    if (!authUrl) return;
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) {
      const intentUrl = toIntentUrl(authUrl);
      if (intentUrl) {
        window.location.href = intentUrl;
        setTimeout(() => {
          window.open(authUrl, "_blank", "noopener,noreferrer");
        }, 700);
        return;
      }
    }
    window.open(authUrl, "_blank", "noopener,noreferrer");
  };

  const copyUrl = async () => {
    if (!authUrl) return;
    try {
      await navigator.clipboard.writeText(authUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-zinc-900">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Notion連携</h1>
        <p className="mt-3 text-sm text-zinc-700">
          LINE内ブラウザで失敗する場合があるため、外部ブラウザで連携を続けてください。
        </p>

        {authUrl ? (
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={openExternal}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              外部ブラウザで連携を続ける
            </button>
            <button
              type="button"
              onClick={copyUrl}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              連携URLをコピー
            </button>
            <p className="text-xs text-zinc-500">
              {copied
                ? "連携URLをコピーしました。"
                : "うまく開けない場合はURLコピー後、Safari/Chromeに貼り付けてください。"}
            </p>
          </div>
        ) : (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            連携URLが見つかりません。LINEで `Notion連携開始` を再実行してください。
          </p>
        )}
      </div>
    </main>
  );
}
