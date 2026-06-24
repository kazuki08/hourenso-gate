"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";

function isEmbeddedWebView(userAgent: string) {
  const ua = userAgent.toLowerCase();
  return (
    ua.includes(" line/") ||
    ua.includes("fban") ||
    ua.includes("fbav") ||
    ua.includes("instagram") ||
    ua.includes("; wv") ||
    ua.includes("webview")
  );
}

export function AuthControls() {
  const { isSignedIn } = useAuth();
  const isWebView =
    typeof window !== "undefined" && isEmbeddedWebView(window.navigator.userAgent);
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  const openInExternalBrowser = () => {
    if (typeof window === "undefined") return;
    const encodedUrl = encodeURIComponent(window.location.href);

    // Android Chrome intent
    const androidIntent = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end`;
    // iOS Safari scheme
    const iosSafari = `x-safari-https://${window.location.host}${window.location.pathname}${window.location.search}`;

    const ua = window.navigator.userAgent.toLowerCase();
    if (ua.includes("android")) {
      window.location.href = androidIntent;
      return;
    }
    if (ua.includes("iphone") || ua.includes("ipad")) {
      window.location.href = iosSafari;
      return;
    }

    // fallback for other environments
    window.open(window.location.href, "_blank", "noopener,noreferrer");
    void navigator.clipboard?.writeText(window.location.href);
    console.info(`Open this URL in a secure browser: ${encodedUrl}`);
  };

  return (
    <div className="flex items-center gap-2">
      {!isSignedIn ? (
        isWebView ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openInExternalBrowser}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 transition hover:bg-amber-100"
            >
              外部ブラウザでログイン
            </button>
            {currentUrl ? (
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(currentUrl)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100"
              >
                URLコピー
              </button>
            ) : null}
          </div>
        ) : (
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              ログイン
            </button>
          </SignInButton>
        )
      ) : (
        <UserButton />
      )}
    </div>
  );
}
