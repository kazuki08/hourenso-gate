"use client";

import { useEffect, useState } from "react";
import { checklistCategories } from "./checklist-data";

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `hourenso-gate-checklist-${yyyy}-${mm}-${dd}`;
}

export default function Home() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
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

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col gap-8 py-12 px-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          今日のチェックリスト
        </h1>

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
      </main>
    </div>
  );
}
