"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  checklistCategories as fallbackCategories,
  type ChecklistCategory,
} from "../checklist-data";
import {
  ALL_TOOLS_ID,
  CHECKLIST_TEMPLATES_STORAGE_KEY,
  getTodayProgressStorageKey,
  type ChecklistTemplateSettings,
  type TemplateVisibilityRule,
} from "../template-storage";
import {
  visibilityRuleTemplates,
  type VisibilityRuleContent,
} from "../checklist-visibility-rules";

const SEND_MESSAGE_PLACEHOLDER = `・〇〇の対応が完了しました。テスト等のレイアウト崩れも修正済みです。
・△△について、ページ遷移周りで詰まっています。後ほどご相談させてください。

サイト：https://example.com`;

export default function ChecklistPage() {
  const searchParams = useSearchParams();
  const requestedToolId = searchParams.get("tool");

  const [categories, setCategories] = useState<ChecklistCategory[]>(fallbackCategories);
  const [rules, setRules] = useState<TemplateVisibilityRule[]>([]);
  const [activeToolName, setActiveToolName] = useState("共通");
  const [activeToolId, setActiveToolId] = useState("default");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [storageKey, setStorageKey] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(CHECKLIST_TEMPLATES_STORAGE_KEY);
    const fallbackToolId = requestedToolId || "fallback";

    if (!saved) {
      setCategories(fallbackCategories);
      setRules([]);
      setActiveToolName("共通");
      setActiveToolId(fallbackToolId);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Partial<ChecklistTemplateSettings>;
      const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
      const items = Array.isArray(parsed.checklistItems) ? parsed.checklistItems : [];
      const visibilityRules = Array.isArray(parsed.visibilityRules)
        ? parsed.visibilityRules
        : [];

      if (tools.length === 0 || items.length === 0) {
        setCategories(fallbackCategories);
        setRules([]);
        setActiveToolName("共通");
        setActiveToolId(fallbackToolId);
        return;
      }

      const selectableTool =
        tools.find((tool) => tool.id === requestedToolId) ?? tools[0];
      const toolId = selectableTool?.id || fallbackToolId;
      const filteredItems = items.filter(
        (item) => item.toolId === ALL_TOOLS_ID || item.toolId === toolId
      );

      if (filteredItems.length === 0) {
        setCategories(fallbackCategories);
        setRules([]);
        setActiveToolName(selectableTool?.name || "共通");
        setActiveToolId(toolId);
        return;
      }

      setCategories([
        {
          id: `template-${toolId}`,
          title: `${selectableTool?.name || "選択ツール"}のチェック項目`,
          items: filteredItems.map((item) => ({
            id: item.id,
            label: item.label,
          })),
        },
      ]);
      setRules(
        visibilityRules.filter(
          (rule) => rule.toolId === ALL_TOOLS_ID || rule.toolId === toolId
        )
      );
      setActiveToolName(selectableTool?.name || "共通");
      setActiveToolId(toolId);
    } catch {
      setCategories(fallbackCategories);
      setRules([]);
      setActiveToolName("共通");
      setActiveToolId(fallbackToolId);
    }
  }, [requestedToolId]);

  // 初回マウント時に当日分の保存内容を読み込む（テンプレートとは別キー）
  useEffect(() => {
    const key = getTodayProgressStorageKey(activeToolId);
    const allItems = categories.flatMap((category) => category.items);
    const defaultChecked = Object.fromEntries(allItems.map((item) => [item.id, true]));
    const saved = localStorage.getItem(key);

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        setChecked({ ...defaultChecked, ...parsed });
      } catch {
        setChecked(defaultChecked);
      }
    } else {
      setChecked(defaultChecked);
    }
    setStorageKey(key);
  }, [activeToolId, categories]);

  // チェック状態が変わるたびに保存する（読み込み完了後のみ）
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(checked));
    }
  }, [checked, storageKey]);

  const toggleItem = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allItems = categories.flatMap((category) => category.items);
  const visibleTargets = rules
    .filter((rule) =>
      allItems.some((item) => item.label === rule.triggerLabel && checked[item.id])
    )
    .map((rule) => rule.targetLabel);
  const revealedContents = visibilityRuleTemplates.reduce<VisibilityRuleContent[]>(
    (acc, rule) => {
      if (!checked[rule.triggerItemId]) {
        return acc;
      }
      return [...acc, ...rule.contents];
    },
    []
  );

  const remainingCount = allItems.filter((item) => !checked[item.id]).length;
  const allChecked = remainingCount === 0;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col gap-8 py-12 px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              今日のチェックリスト
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              選択ツール: {activeToolName}
            </p>
          </div>
          <Link
            href="/admin"
            className="mt-1 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ⚙️ 管理設定
          </Link>
        </div>

        {categories.map((category) => (
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

        {rules.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
              表示ルールで出現する項目
            </h2>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              {visibleTargets.length > 0 ? (
                <ul className="list-disc pl-5 text-zinc-700 dark:text-zinc-300">
                  {visibleTargets.map((target, index) => (
                    <li key={`${target}-${index}`}>{target}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400">
                  条件を満たすとここにURL/追加項目が表示されます
                </p>
              )}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
            必要なURL・追加要素
          </h2>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            {revealedContents.length > 0 ? (
              <ul className="space-y-2">
                {revealedContents.map((content) => (
                  <li key={content.id} className="text-zinc-700 dark:text-zinc-300">
                    <span className="mr-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      {content.label}
                    </span>
                    {content.type === "url" ? (
                      <a
                        href={content.value}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                      >
                        {content.value}
                      </a>
                    ) : (
                      <span className="text-sm">{content.value}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-zinc-500 dark:text-zinc-400">
                特定のチェックをONにすると、必要なURLや追加要素がここに表示されます。
              </p>
            )}
          </div>
        </section>

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
