"use client";

import { useState } from "react";

type LiffSdk = {
  init: (args: { liffId: string }) => Promise<void>;
  openWindow: (args: { url: string; external?: boolean }) => void;
};

declare global {
  interface Window {
    liff?: LiffSdk;
  }
}

function toIntentUrl(url: string) {
  if (!url.startsWith("https://")) return "";
  const withoutScheme = url.slice("https://".length);
  return `intent://${withoutScheme}#Intent;scheme=https;action=android.intent.action.VIEW;end`;
}

function toSafariSchemeUrl(url: string) {
  if (!url.startsWith("https://")) return "";
  return `x-safari-${url}`;
}

function loadLiffSdk() {
  return new Promise<void>((resolve) => {
    if (window.liff) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-liff-sdk="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      setTimeout(() => resolve(), 1500);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.async = true;
    script.dataset.liffSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

export default function NotionConnectClient({
  authUrl,
  liffId,
}: {
  authUrl: string;
  liffId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);

  const openExternal = async () => {
    if (!authUrl) return;
    if (opening) return;
    setOpening(true);

    try {
      if (liffId) {
        await loadLiffSdk();
        if (window.liff) {
          await window.liff.init({ liffId });
          window.liff.openWindow({ url: authUrl, external: true });
          return;
        }
      }
    } catch {
      // Fallbacks below.
    } finally {
      setOpening(false);
    }

    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("iphone") || ua.includes("ipad")) {
      const safariUrl = toSafariSchemeUrl(authUrl);
      if (safariUrl) {
        window.location.href = safariUrl;
        setTimeout(() => {
          window.location.href = authUrl;
        }, 700);
        return;
      }
    }
    if (ua.includes("android")) {
      const intentUrl = toIntentUrl(authUrl);
      if (intentUrl) {
        window.location.href = intentUrl;
        setTimeout(() => {
          window.location.href = authUrl;
        }, 700);
        return;
      }
    }
    window.location.href = authUrl;
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
              {opening ? "外部ブラウザを起動中..." : "外部ブラウザで連携を続ける"}
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
