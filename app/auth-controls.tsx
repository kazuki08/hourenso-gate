"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";

export function AuthControls() {
  const { isSignedIn } = useAuth();

  return (
    <div className="flex items-center gap-2">
      {!isSignedIn ? (
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            ログイン
          </button>
        </SignInButton>
      ) : (
        <UserButton />
      )}
    </div>
  );
}
