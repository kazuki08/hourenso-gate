"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { checklistCategories } from "../checklist-data";

const SEND_MESSAGE_PLACEHOLDER = `・〇〇の対応が完了しました。テスト等のレイアウト崩れも修正済みです。
・△△について、ページ遷移周りで詰まっています。後ほどご相談させてください。

サイト：https://example.com`;

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `hourenso-gate-checklist-${yyyy}-${mm}-${dd}`;
}

export default function ChecklistPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(
      checklistCategories.flatMap((c) => c.items).map((i) => [i.id, true])
    )
  );
  const [storageKey, setStorageKey] = useState<string | null>(null);

  // 初回マウント時に当日分の保存内容を読み込む
  useEffect(() => {
    const key = getTodayKey();
    const saved = localStorage.getItem(key);
    if (saved) {
      setChecked(JSON.parse(saved));
    }
    setStorageKey(key);
  }, []);

  // チェック状態が変わるたびに保存する（読み込み完了後のみ）
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(checked));
    }
  }, [checked, storageKey]);

  const toggleItem = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allItems = checklistCategories.flatMap((category) => category.items);
  const remainingCount = allItems.filter((item) => !checked[item.id]).length;
  const allChecked = remainingCount === 0;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col gap-8 py-12 px-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            今日のチェックリスト
          </h1>
          <Link
            href="/admin"
            className="mt-1 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ⚙️ 管理設定
          </Link>
        </div>

        {checklistCategories.map((category) => (
          <section key={category.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
              {category.title}
            </h2>
            <ul className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              {category.items.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checked[item.id]}
                      onChange={() => toggleItem(item.id)}
                      className="h-5 w-5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600"
                    />
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {item.label}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {allChecked ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
              送信文
            </h2>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <pre className="whitespace-pre-wrap font-sans text-zinc-700 dark:text-zinc-300">
                {SEND_MESSAGE_PLACEHOLDER}
              </pre>
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-3">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              🔒 物理ロック作動中：あと{remainingCount}個チェックが必要です
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
