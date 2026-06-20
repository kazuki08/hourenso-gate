"use client";

import Link from "next/link";
import { useState } from "react";

type PageKey = "checklist" | "admin" | "dashboard";

type AppNavigationProps = {
  activePage: PageKey;
};

const NAV_ITEMS: Array<{ key: PageKey; href: string; label: string }> = [
  { key: "checklist", href: "/checklist", label: "チェックリスト" },
  { key: "admin", href: "/admin", label: "管理画面" },
  { key: "dashboard", href: "/dashboard", label: "履歴ダッシュボード" },
];

export function AppSidebarNavigation({ activePage }: AppNavigationProps) {
  return (
    <aside className="hidden lg:fixed lg:bottom-0 lg:left-0 lg:top-16 lg:flex lg:h-[calc(100vh-4rem)] lg:w-64 lg:flex-col lg:border-r lg:border-zinc-200 lg:bg-white lg:p-6 dark:lg:border-zinc-800 dark:lg:bg-zinc-950">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        ナビゲーション
      </h2>
      <nav className="mt-4 flex flex-col gap-2 text-sm">
        {NAV_ITEMS.map((item) =>
          item.key === activePage ? (
            <span
              key={item.key}
              className="rounded-md bg-zinc-100 px-3 py-2 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {item.label}
            </Link>
          )
        )}
      </nav>
    </aside>
  );
}

export function AppMobileNavigation({ activePage }: AppNavigationProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setIsMobileMenuOpen((prev) => !prev)}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        aria-label="メニューを開く"
      >
        <span className="text-base">☰</span>
        メニュー
      </button>
      {isMobileMenuOpen ? (
        <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <nav className="flex flex-col gap-2 text-sm">
            {NAV_ITEMS.map((item) =>
              item.key === activePage ? (
                <span
                  key={item.key}
                  className="rounded-md bg-zinc-100 px-3 py-2 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  key={item.key}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
