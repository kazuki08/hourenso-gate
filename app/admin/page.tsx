"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ALL_TOOLS_ID,
  CHECKLIST_TEMPLATES_STORAGE_KEY,
  LEGACY_ADMIN_SETTINGS_STORAGE_KEY,
  type ChecklistTemplateSettings,
  createClientId,
  type TemplateChecklistItem,
  type TemplateTool,
  type TemplateVisibilityRule,
} from "../template-storage";

type AdminToolForm = TemplateTool;
type AdminChecklistItemForm = {
  id: string;
  title: string;
  toolId: string;
};
type AdminRuleForm = {
  id: string;
  toolId: string;
  trigger: string;
  target: string;
};

export default function AdminPage() {
  const [tools, setTools] = useState<AdminToolForm[]>([
    { id: createClientId("tool"), name: "", description: "" },
  ]);
  const [checklistItems, setChecklistItems] = useState<AdminChecklistItemForm[]>([
    { id: createClientId("item"), title: "", toolId: ALL_TOOLS_ID },
  ]);
  const [visibilityRules, setVisibilityRules] = useState<AdminRuleForm[]>([
    {
      id: createClientId("rule"),
      toolId: ALL_TOOLS_ID,
      trigger: "",
      target: "",
    },
  ]);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const templateJson =
      localStorage.getItem(CHECKLIST_TEMPLATES_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_ADMIN_SETTINGS_STORAGE_KEY);
    if (!templateJson) return;

    try {
      const parsed = JSON.parse(templateJson) as Partial<ChecklistTemplateSettings> & {
        checklistItems?: Array<{ id?: string; label?: string; title?: string; toolId?: string }>;
        visibilityRules?: Array<{
          id?: string;
          toolId?: string;
          triggerLabel?: string;
          trigger?: string;
          targetLabel?: string;
          target?: string;
        }>;
      };

      if (Array.isArray(parsed.tools) && parsed.tools.length > 0) {
        setTools(
          parsed.tools.map((tool) => ({
            id: tool.id || createClientId("tool"),
            name: tool.name ?? "",
            description: tool.description ?? "",
          }))
        );
      }
      if (Array.isArray(parsed.checklistItems) && parsed.checklistItems.length > 0) {
        setChecklistItems(
          parsed.checklistItems.map((item) => ({
            id: item.id || createClientId("item"),
            title: item.label ?? "",
            toolId: item.toolId || ALL_TOOLS_ID,
          }))
        );
      }
      if (Array.isArray(parsed.visibilityRules) && parsed.visibilityRules.length > 0) {
        setVisibilityRules(
          parsed.visibilityRules.map((rule) => ({
            id: rule.id || createClientId("rule"),
            toolId: rule.toolId || ALL_TOOLS_ID,
            trigger: rule.triggerLabel ?? "",
            target: rule.targetLabel ?? "",
          }))
        );
      }
    } catch {
      // 保存データが壊れている場合は既定値のまま表示する
    }
  }, []);

  const updateTool = (
    index: number,
    key: keyof Pick<AdminToolForm, "name" | "description">,
    value: string
  ) => {
    setTools((prev) =>
      prev.map((tool, i) => (i === index ? { ...tool, [key]: value } : tool))
    );
  };

  const updateChecklistItem = (
    index: number,
    key: keyof Pick<AdminChecklistItemForm, "title" | "toolId">,
    value: string
  ) => {
    setChecklistItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );
  };

  const updateRule = (
    index: number,
    key: keyof Pick<AdminRuleForm, "trigger" | "target" | "toolId">,
    value: string
  ) => {
    setVisibilityRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, [key]: value } : rule))
    );
  };

  const saveSettings = () => {
    const normalizedTools: TemplateTool[] = tools
      .map((tool) => ({
        id: tool.id || createClientId("tool"),
        name: tool.name.trim(),
        description: tool.description.trim(),
      }))
      .filter((tool) => tool.name !== "");

    const normalizedChecklistItems: TemplateChecklistItem[] = checklistItems
      .map((item) => ({
        id: item.id || createClientId("item"),
        label: item.title.trim(),
        toolId: item.toolId || ALL_TOOLS_ID,
      }))
      .filter((item) => item.label !== "");

    const normalizedVisibilityRules: TemplateVisibilityRule[] = visibilityRules
      .map((rule) => ({
        id: rule.id || createClientId("rule"),
        toolId: rule.toolId || ALL_TOOLS_ID,
        triggerLabel: rule.trigger.trim(),
        targetLabel: rule.target.trim(),
      }))
      .filter((rule) => rule.triggerLabel !== "" && rule.targetLabel !== "");

    const settings: ChecklistTemplateSettings = {
      tools: normalizedTools,
      checklistItems: normalizedChecklistItems,
      visibilityRules: normalizedVisibilityRules,
    };

    localStorage.setItem(CHECKLIST_TEMPLATES_STORAGE_KEY, JSON.stringify(settings));
    setSaveMessage("設定を保存しました");
  };

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-6 py-10 dark:bg-black">
      <main className="w-full max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              管理画面
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              SaaS化に向けた設定UIのモックです
            </p>
          </div>
          <Link
            href="/"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ユーザー画面（チェックリスト）へ戻る
          </Link>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              ツールの追加・編集
            </h2>
            <button
              type="button"
              onClick={() =>
                setTools((prev) => [
                  ...prev,
                  { id: createClientId("tool"), name: "", description: "" },
                ])
              }
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              + 追加
            </button>
          </div>

          <div className="space-y-3">
            {tools.map((tool, index) => (
              <div key={`tool-${index}`} className="grid gap-2 sm:grid-cols-2">
                <input
                  value={tool.name}
                  onChange={(event) => updateTool(index, "name", event.target.value)}
                  placeholder="ツール名"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <input
                  value={tool.description}
                  onChange={(event) =>
                    updateTool(index, "description", event.target.value)
                  }
                  placeholder="説明（例：日次報告用）"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              チェックリストの編集（追加・削除）
            </h2>
            <button
              type="button"
              onClick={() =>
                setChecklistItems((prev) => [
                  ...prev,
                  {
                    id: createClientId("item"),
                    title: "",
                    toolId: ALL_TOOLS_ID,
                  },
                ])
              }
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              + 項目を追加
            </button>
          </div>

          <div className="space-y-2">
            {checklistItems.map((item, index) => (
              <div key={item.id} className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                <input
                  value={item.title}
                  onChange={(event) =>
                    updateChecklistItem(index, "title", event.target.value)
                  }
                  placeholder="チェック項目名"
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <select
                  value={item.toolId}
                  onChange={(event) =>
                    updateChecklistItem(index, "toolId", event.target.value)
                  }
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value={ALL_TOOLS_ID}>全ツール共通</option>
                  {tools
                    .filter((tool) => tool.name.trim() !== "")
                    .map((tool) => (
                      <option key={tool.id} value={tool.id}>
                        {tool.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setChecklistItems((prev) =>
                      prev.length === 1
                        ? prev
                        : prev.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                  className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              表示/非表示ルールの紐付け
            </h2>
            <button
              type="button"
              onClick={() =>
                setVisibilityRules((prev) => [
                  ...prev,
                  {
                    id: createClientId("rule"),
                    toolId: ALL_TOOLS_ID,
                    trigger: "",
                    target: "",
                  },
                ])
              }
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              + ルールを追加
            </button>
          </div>

          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            例：「Aをチェックしたら、B項目やURLを表示する」
          </p>

          <div className="space-y-3">
            {visibilityRules.map((rule, index) => (
              <div
                key={rule.id}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_180px]"
              >
                <input
                  value={rule.trigger}
                  onChange={(event) => updateRule(index, "trigger", event.target.value)}
                  placeholder="トリガー項目（例：Aをチェック）"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <input
                  value={rule.target}
                  onChange={(event) => updateRule(index, "target", event.target.value)}
                  placeholder="表示対象（例：URL_B / 項目B）"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <select
                  value={rule.toolId}
                  onChange={(event) => updateRule(index, "toolId", event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value={ALL_TOOLS_ID}>全ツール共通</option>
                  {tools
                    .filter((tool) => tool.name.trim() !== "")
                    .map((tool) => (
                      <option key={tool.id} value={tool.id}>
                        {tool.name}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveSettings}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            設定を保存
          </button>
          {saveMessage ? (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">
              {saveMessage}
            </span>
          ) : null}
        </div>
      </main>
    </div>
  );
}
