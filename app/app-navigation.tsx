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
    <aside className="hidden lg:fixed lg:bottom-0 lg:left-0 lg:top-16 lg:flex lg:h-[calc(100vh-4rem)] lg:w-64 lg:flex-col lg:border-r lg:border-blue-100 lg:bg-white lg:p-6">
      <h2 className="text-lg font-semibold text-zinc-900">
        ナビゲーション
      </h2>
      <nav className="mt-4 flex flex-col gap-2 text-sm">
        {NAV_ITEMS.map((item) =>
          item.key === activePage ? (
            <span
              key={item.key}
              className="rounded-md bg-blue-50 px-3 py-2 font-medium text-blue-700"
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="rounded-md px-3 py-2 text-zinc-600 hover:bg-sky-50 hover:text-sky-700"
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
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-zinc-800"
        aria-label="メニューを開く"
      >
        <span className="text-base">☰</span>
        メニュー
      </button>
      {isMobileMenuOpen ? (
        <div className="mt-2 rounded-lg border border-blue-100 bg-white p-3 shadow-sm">
          <nav className="flex flex-col gap-2 text-sm">
            {NAV_ITEMS.map((item) =>
              item.key === activePage ? (
                <span
                  key={item.key}
                  className="rounded-md bg-blue-50 px-3 py-2 font-medium text-blue-700"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  key={item.key}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-zinc-700 hover:bg-sky-50 hover:text-sky-700"
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
