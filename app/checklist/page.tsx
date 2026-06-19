"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  checklistCategories as fallbackCategories,
  type ChecklistCategory,
} from "../checklist-data";
import {
  ALL_TOOLS_ID,
  CHECKLIST_TEMPLATES_STORAGE_KEY,
  getTodayProgressStorageKey,
  LINE_DESTINATION_SETTINGS_STORAGE_KEY,
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
const INTEGRATION_SETTINGS_STORAGE_KEY = "integration_settings";
const MASTER_CHECKLIST_STORAGE_PREFIX = "checklist_master_edit";

function getMasterChecklistStorageKey(toolId: string) {
  return `${MASTER_CHECKLIST_STORAGE_PREFIX}-${toolId}`;
}

function createChecklistItemId(categoryId: string) {
  return `${categoryId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function ChecklistPage() {
  const [requestedToolId, setRequestedToolId] = useState<string | null>(null);

  const [categories, setCategories] = useState<ChecklistCategory[]>(fallbackCategories);
  const [rules, setRules] = useState<TemplateVisibilityRule[]>([]);
  const [activeToolName, setActiveToolName] = useState("共通");
  const [activeToolId, setActiveToolId] = useState("default");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [formattedMessage, setFormattedMessage] = useState(SEND_MESSAGE_PLACEHOLDER);
  const [isFormatting, setIsFormatting] = useState(false);
  const [formatDone, setFormatDone] = useState(false);
  const [formatError, setFormatError] = useState("");
  const [dataDestination, setDataDestination] = useState("未設定");
  const [reportDestination, setReportDestination] = useState("未設定");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");
  const [mode, setMode] = useState<"high" | "medium" | "low">("high");
  const [isMasterChecklistLoaded, setIsMasterChecklistLoaded] = useState(false);
  const [screeningDone, setScreeningDone] = useState(false);
  const [screeningWarning, setScreeningWarning] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [lineRecipientType, setLineRecipientType] = useState<"user" | "group">("user");

  const handleModeChange = (nextMode: "high" | "medium" | "low") => {
    setMode(nextMode);
    if (nextMode !== "medium") {
      setScreeningDone(false);
      setScreeningWarning("");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRequestedToolId(params.get("tool"));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(CHECKLIST_TEMPLATES_STORAGE_KEY);
    const fallbackToolId = requestedToolId || "fallback";
    setIsMasterChecklistLoaded(false);

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

  useEffect(() => {
    if (!activeToolId) return;

    const saved = localStorage.getItem(getMasterChecklistStorageKey(activeToolId));
    if (!saved) {
      setIsMasterChecklistLoaded(true);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as ChecklistCategory[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setCategories(parsed);
      }
    } catch {
      // 編集データ破損時はテンプレート表示を継続
    } finally {
      setIsMasterChecklistLoaded(true);
    }
  }, [activeToolId]);

  useEffect(() => {
    if (!activeToolId || !isMasterChecklistLoaded) return;
    localStorage.setItem(
      getMasterChecklistStorageKey(activeToolId),
      JSON.stringify(categories)
    );
  }, [activeToolId, categories, isMasterChecklistLoaded]);

  useEffect(() => {
    const saved = localStorage.getItem(INTEGRATION_SETTINGS_STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as {
        dataDestination?: string;
        reportDestination?: string;
      };
      if (parsed.dataDestination) {
        setDataDestination(parsed.dataDestination);
      }
      if (parsed.reportDestination) {
        setReportDestination(parsed.reportDestination);
      }
    } catch {
      // 保持データ破損時は既定値を利用
    }
  }, []);

  useEffect(() => {
    const savedType = localStorage.getItem(LINE_DESTINATION_SETTINGS_STORAGE_KEY);
    if (savedType === "user" || savedType === "group") {
      setLineRecipientType(savedType);
    }
  }, []);

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

  const addChecklistItem = (categoryId: string, insertAfterId: string) => {
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category;

        const insertIndex = category.items.findIndex((item) => item.id === insertAfterId);
        if (insertIndex < 0) return category;

        const nextItems = [...category.items];
        nextItems.splice(insertIndex + 1, 0, {
          id: createChecklistItemId(categoryId),
          label: "新しいチェック項目",
        });

        return { ...category, items: nextItems };
      })
    );
  };

  const removeChecklistItem = (categoryId: string, itemId: string) => {
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId || category.items.length <= 1) return category;
        return {
          ...category,
          items: category.items.filter((item) => item.id !== itemId),
        };
      })
    );
  };

  const handleFormatMessage = async () => {
    if (draftMessage.trim() === "" || isFormatting) {
      return;
    }

    setIsFormatting(true);
    setFormatError("");

    try {
      const response = await fetch("/api/format-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: draftMessage }),
      });

      if (!response.ok) {
        throw new Error("failed_to_format");
      }

      const data = (await response.json()) as { formattedMessage?: string };
      setFormattedMessage(data.formattedMessage || draftMessage);
      setFormatDone(true);
      setSendError("");
      if (mode === "medium") {
        const warning =
          draftMessage.trim().length < 20
            ? "AIスクリーニング警告: メッセージが短いため、抜け漏れがないか確認してください。"
            : "";
        setScreeningWarning(warning);
        setScreeningDone(true);
      }
    } catch {
      setFormatError("整形に失敗しました。しばらくして再試行してください。");
    } finally {
      setIsFormatting(false);
    }
  };

  const handleSaveToSheet = async () => {
    if (!formatDone || isSending) {
      return;
    }

    setIsSending(true);
    setSendError("");
    setSendSuccess("");

    try {
      const response = await fetch("/api/save-to-sheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sentAt: new Date().toISOString(),
          message: formattedMessage,
          toolName: activeToolName,
          dataDestination,
          reportDestination,
          checklistStates: allItems.map((item) => ({
            id: item.id,
            label: item.label,
            checked: !!checked[item.id],
          })),
          formattedMessage,
          lineRecipientType,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string; error?: string };
        throw new Error(data.message || data.error || "send_failed");
      }

      setSendSuccess("保存が完了しました。");
    } catch (error) {
      setSendError(
        error instanceof Error
          ? `送信に失敗しました: ${error.message}`
          : "送信に失敗しました。"
      );
    } finally {
      setIsSending(false);
    }
  };

  const allItems = categories.flatMap((category) => category.items);
  const visibleTargets = rules
    .filter((rule) => {
      const triggerLabels =
        Array.isArray(rule.triggerLabels) && rule.triggerLabels.length > 0
          ? rule.triggerLabels
          : rule.triggerLabel
            ? [rule.triggerLabel]
            : [];
      if (triggerLabels.length === 0) {
        return false;
      }
      return triggerLabels.every((triggerLabel) =>
        allItems.some((item) => item.label === triggerLabel && checked[item.id])
      );
    })
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
  const isSendVisible = mode === "high" || (mode === "medium" && screeningDone);
  const isSendEnabled =
    mode === "high" ? !isSending : mode === "medium" ? screeningDone && !isSending : false;

  return (
    <div className="flex flex-1 bg-zinc-50 dark:bg-black">
      <aside className="hidden lg:fixed lg:bottom-0 lg:left-0 lg:top-16 lg:flex lg:h-[calc(100vh-4rem)] lg:w-64 lg:flex-col lg:border-r lg:border-zinc-200 lg:bg-white lg:p-6 dark:lg:border-zinc-800 dark:lg:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          ナビゲーション
        </h2>
        <nav className="mt-4 flex flex-col gap-2 text-sm">
          <button
            type="button"
            className="rounded-md bg-zinc-100 px-3 py-2 text-left text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
          >
            チェックリスト
          </button>
          <Link
            href="/admin"
            className="rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            管理画面
          </Link>
        </nav>
      </aside>

      <main className="flex w-full flex-1 justify-center px-4 py-6 sm:px-6 sm:py-10 lg:ml-64 lg:py-12">
        <div className="flex w-full max-w-2xl flex-col gap-6 px-1 sm:gap-8 sm:px-0">
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
                <span className="rounded-md bg-zinc-100 px-3 py-2 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                  チェックリスト
                </span>
                <Link
                  href="/admin"
                  className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  管理画面
                </Link>
              </nav>
            </div>
          ) : null}
        </div>
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            モード選択（自走度）
          </h2>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "high", label: "自走度：高" },
              { id: "medium", label: "自走度：中" },
              { id: "low", label: "自走度：低" },
            ].map((option) => {
              const isActive = mode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    handleModeChange(option.id as "high" | "medium" | "low")
                  }
                  className={`min-h-11 rounded-md px-4 py-2 text-sm transition ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            現在モード：
            {mode === "high" ? "高" : mode === "medium" ? "中" : "低"}
          </p>
        </section>

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
            ⚙️ 管理画面
          </Link>
        </div>

        {mode === "low" ? (
          <section className="flex min-h-64 items-center justify-center rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-base text-zinc-700 dark:text-zinc-300">
              完全自動AIモード：Notion等のメモから自動でスケジュールと報連相を作成・送信準備中...
            </p>
          </section>
        ) : (
          <>
            {categories.map((category) => (
              <section key={category.id} className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
                  {category.title}
                </h2>
                <ul className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  {category.items.map((item) => (
                    <li key={item.id}>
                      <div className="flex items-center gap-2">
                        <label className="flex flex-1 cursor-pointer items-center gap-3">
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
                        <button
                          type="button"
                          onClick={() => addChecklistItem(category.id, item.id)}
                          aria-label="項目を追加"
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeChecklistItem(category.id, item.id)}
                          aria-label="項目を削除"
                          disabled={category.items.length <= 1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          -
                        </button>
                      </div>
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
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="message-input"
                        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                      >
                        報連相メッセージ入力
                      </label>
                      <textarea
                        id="message-input"
                        value={draftMessage}
                        onChange={(event) => {
                          setDraftMessage(event.target.value);
                          setFormatDone(false);
                      setScreeningDone(false);
                      setScreeningWarning("");
                        }}
                        placeholder="ここにメッセージを入力してください"
                        rows={6}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleFormatMessage}
                        disabled={isFormatting || draftMessage.trim() === ""}
                        className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        {mode === "medium"
                          ? isFormatting
                            ? "AIスクリーニング中..."
                            : "AIスクリーニング"
                          : isFormatting
                            ? "AI整形中..."
                            : "AIで整形する"}
                      </button>
                      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={formatDone}
                          readOnly
                          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-600"
                        />
                        整形完了
                      </label>
                      {formatError ? (
                        <span className="text-sm text-red-600 dark:text-red-400">
                          {formatError}
                        </span>
                      ) : null}
                    </div>
                    {mode === "medium" && screeningWarning ? (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        {screeningWarning}
                      </div>
                    ) : null}

                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                      <p>保存先: {dataDestination}</p>
                      <p>通知先: {reportDestination}</p>
                    </div>

                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        整形結果
                      </p>
                      <pre className="whitespace-pre-wrap font-sans text-zinc-700 dark:text-zinc-300">
                        {formattedMessage}
                      </pre>
                    </div>

                    {isSendVisible ? (
                      <button
                        type="button"
                        onClick={handleSaveToSheet}
                        disabled={!isSendEnabled}
                        className="min-h-11 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 sm:w-fit"
                      >
                        {isSending ? "スプレッドシートに保存中..." : "送信する"}
                      </button>
                    ) : null}
                    {sendError ? (
                      <p className="text-sm text-red-600 dark:text-red-400">{sendError}</p>
                    ) : null}
                    {sendSuccess ? (
                      <p className="text-sm text-emerald-700 dark:text-emerald-400">
                        {sendSuccess}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : (
              <section className="flex flex-col gap-3">
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  🔒 物理ロック作動中：あと{remainingCount}個チェックが必要です
                </div>
              </section>
            )}
          </>
        )}
        </div>
      </main>
    </div>
  );
}
