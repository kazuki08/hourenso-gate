"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [tools, setTools] = useState<TemplateTool[]>(fallbackTools);
  const [selectedToolId, setSelectedToolId] = useState("");

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

  const selectedTool = tools.find((tool) => tool.id === selectedToolId);

  const handleOpenTool = () => {
    if (!selectedToolId) {
      return;
    }
    router.push(`/checklist?tool=${selectedToolId}`);
  };

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

        <section className="mx-auto w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-4">
            <label
              htmlFor="tool-select"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              使用するツール
            </label>
            <select
              id="tool-select"
              value={selectedToolId}
              onChange={(event) => setSelectedToolId(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="" disabled>
                ツールを選択してください
              </option>
              {tools.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.name}
                </option>
              ))}
            </select>

            <p className="min-h-5 text-sm text-zinc-600 dark:text-zinc-400">
              {selectedTool?.description || "選択したツールの説明がここに表示されます"}
            </p>

            <button
              type="button"
              onClick={handleOpenTool}
              disabled={!selectedToolId}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              このツールを開く
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
