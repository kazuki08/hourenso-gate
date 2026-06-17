"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CHECKLIST_TEMPLATES_STORAGE_KEY,
  type ChecklistTemplateSettings,
  type TemplateTool,
} from "./template-storage";

const fallbackTools: TemplateTool[] = [
  { id: "tool-a", name: "ツールA", description: "日次報告用チェックリスト" },
  { id: "tool-b", name: "ツールB", description: "障害対応用チェックリスト" },
];

export default function Home() {
  const [tools, setTools] = useState<TemplateTool[]>(fallbackTools);

  useEffect(() => {
    const saved = localStorage.getItem(CHECKLIST_TEMPLATES_STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as Partial<ChecklistTemplateSettings>;
      if (Array.isArray(parsed.tools) && parsed.tools.length > 0) {
        const sanitized = parsed.tools.filter(
          (tool): tool is TemplateTool =>
            Boolean(tool?.id) && Boolean(tool?.name)
        );
        if (sanitized.length > 0) {
          setTools(sanitized);
        }
      }
    } catch {
      // 破損データ時はフォールバック表示
    }
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <main className="w-full max-w-4xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              ツールを選択
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              利用する報連相ツールを選んでください（現在はモック表示です）
            </p>
          </div>
          <Link
            href="/admin"
            className="mt-1 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ⚙️ 管理設定
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <Link
              key={tool.id}
              href={`/checklist?tool=${tool.id}`}
              className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
            >
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {tool.name}
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {tool.description}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
