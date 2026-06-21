"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AppMobileNavigation, AppSidebarNavigation } from "../app-navigation";
import {
  checklistCategories as fallbackCategories,
  type ChecklistCategory,
} from "../checklist-data";
import {
  AI_FORMAT_PROMPT_STORAGE_KEY,
  ALL_TOOLS_ID,
  CHECKLIST_TEMPLATES_STORAGE_KEY,
  getTodayProgressStorageKey,
  LINE_DESTINATION_SETTINGS_STORAGE_KEY,
  type ChecklistTemplateSettings,
  type TemplateVisibilityRule,
} from "../template-storage";
import { DEFAULT_AI_FORMAT_PROMPT } from "../../lib/prompts";

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

function createChecklistCategoryId() {
  return `category-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type LowModeChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function renderWithAutoLinks(text: string) {
  const splitRegex = /(https?:\/\/[^\s]+)/g;
  const chunks = text.split(splitRegex);
  const isUrl = /^https?:\/\/[^\s]+$/;

  return chunks.map((chunk, index) => {
    if (isUrl.test(chunk)) {
      return (
        <a
          key={`${chunk}-${index}`}
          href={chunk}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 underline-offset-2 hover:underline"
        >
          {chunk}
        </a>
      );
    }
    return <span key={`${chunk}-${index}`}>{chunk}</span>;
  });
}

export default function ChecklistPage() {
  const { user } = useUser();
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
  const [isNotionChecking, setIsNotionChecking] = useState(false);
  const [omissionFeedback, setOmissionFeedback] = useState("");
  const [omissionError, setOmissionError] = useState("");
  const [isLowModeProcessing, setIsLowModeProcessing] = useState(false);
  const [lowModeInput, setLowModeInput] = useState("");
  const [lowModeChatMessages, setLowModeChatMessages] = useState<LowModeChatMessage[]>([]);
  const [dataDestination, setDataDestination] = useState("未設定");
  const [reportDestination, setReportDestination] = useState("未設定");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");
  const [mode, setMode] = useState<"high" | "low">("high");
  const [isMasterChecklistLoaded, setIsMasterChecklistLoaded] = useState(false);
  const [lineRecipientType, setLineRecipientType] = useState<"user" | "group">("user");
  const [aiFormatPrompt, setAiFormatPrompt] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_AI_FORMAT_PROMPT;
    }
    const savedPrompt = localStorage.getItem(AI_FORMAT_PROMPT_STORAGE_KEY);
    return savedPrompt ?? DEFAULT_AI_FORMAT_PROMPT;
  });

  const handleModeChange = (nextMode: "high" | "low") => {
    setMode(nextMode);
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

  const updateChecklistItemLabel = (categoryId: string, itemId: string, value: string) => {
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category;
        return {
          ...category,
          items: category.items.map((item) =>
            item.id === itemId ? { ...item, label: value } : item
          ),
        };
      })
    );
  };

  const updateMajorCategoryLabel = (index: number, value: string) => {
    setCategories((prev) =>
      prev.map((category, i) => (i === index ? { ...category, title: value } : category))
    );
  };

  const addMajorCategoryAfter = (index: number) => {
    const nextLabel = `大項目 ${categories.length + 1}`;
    const newCategoryId = createChecklistCategoryId();
    const newCategory: ChecklistCategory = {
      id: newCategoryId,
      title: nextLabel,
      items: [{ id: createChecklistItemId(newCategoryId), label: "新しいチェック項目" }],
    };

    setCategories((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, newCategory);
      return next;
    });
  };

  const removeMajorCategory = (index: number) => {
    if (categories.length <= 1) {
      return;
    }

    setCategories((prev) => prev.filter((_, i) => i !== index));
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
        body: JSON.stringify({
          message: draftMessage,
          prompt: aiFormatPrompt,
        }),
      });

      if (!response.ok) {
        throw new Error("failed_to_format");
      }

      const data = (await response.json()) as { formattedMessage?: string };
      setFormattedMessage(data.formattedMessage || draftMessage);
      setFormatDone(true);
      setSendError("");
    } catch {
      setFormatError("整形に失敗しました。しばらくして再試行してください。");
    } finally {
      setIsFormatting(false);
    }
  };

  const fetchNotionText = async () => {
    const notionResponse = await fetch("/api/notion/fetch", {
      method: "GET",
      cache: "no-store",
    });
    const notionData = (await notionResponse.json()) as {
      ok?: boolean;
      content?: string;
      error?: string;
    };
    if (!notionResponse.ok || !notionData.ok || !notionData.content?.trim()) {
      throw new Error(notionData.error || "notion_fetch_failed");
    }
    return notionData.content;
  };

  const checkOmissions = async (notionText: string, draftText: string) => {
    const aiResponse = await fetch("/api/ai/check-omissions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        notionText,
        draftText,
      }),
    });
    const aiData = (await aiResponse.json()) as {
      ok?: boolean;
      feedback?: string;
      error?: string;
      message?: string;
    };
    if (!aiResponse.ok || !aiData.ok || !aiData.feedback?.trim()) {
      throw new Error(aiData.message || aiData.error || "omission_check_failed");
    }
    return aiData.feedback;
  };

  const formatMessageWithApi = async (message: string) => {
    const response = await fetch("/api/format-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        prompt: aiFormatPrompt,
      }),
    });
    if (!response.ok) {
      throw new Error("failed_to_format");
    }
    const data = (await response.json()) as { formattedMessage?: string };
    return data.formattedMessage || message;
  };

  const handleLowModeChatSubmit = async () => {
    if (isLowModeProcessing) {
      return;
    }

    const rawInput = lowModeInput.trim();
    if (!rawInput) {
      return;
    }

    const userMessage: LowModeChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: rawInput,
    };

    setLowModeChatMessages((prev) => [...prev, userMessage]);
    setLowModeInput("");
    setDraftMessage(rawInput);
    setFormatDone(false);
    setFormatError("");
    setSendError("");
    setSendSuccess("");
    setOmissionError("");
    setOmissionFeedback("");
    setIsLowModeProcessing(true);

    try {
      const notionText = await fetchNotionText();
      const omissionResult = await checkOmissions(notionText, rawInput);
      setOmissionFeedback(omissionResult);

      const formatSource = `${rawInput}\n\n【抜け漏れチェック結果】\n${omissionResult}`;
      const formatted = await formatMessageWithApi(formatSource);
      setFormattedMessage(formatted);
      setFormatDone(true);

      const assistantMessage: LowModeChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: `抜け漏れチェック結果:\n${omissionResult}\n\n整形結果:\n${formatted}`,
      };
      setLowModeChatMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "low_mode_process_failed";
      setFormatError(`AI処理に失敗しました: ${message}`);
      setOmissionError(`Notion照合に失敗しました: ${message}`);
      setLowModeChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: `処理に失敗しました。${message}`,
        },
      ]);
    } finally {
      setIsLowModeProcessing(false);
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
          senderName,
          mode,
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

  const handleCheckOmissionsFromNotion = async () => {
    if (isNotionChecking) {
      return;
    }

    setIsNotionChecking(true);
    setOmissionError("");
    setOmissionFeedback("");

    try {
      const notionText = await fetchNotionText();

      const draftForCheck =
        draftMessage.trim() || formattedMessage.trim() || "（報告ドラフト未入力）";
      const feedback = await checkOmissions(notionText, draftForCheck);
      setOmissionFeedback(feedback);
    } catch (error) {
      setOmissionError(
        error instanceof Error
          ? `Notion照合に失敗しました: ${error.message}`
          : "Notion照合に失敗しました。"
      );
    } finally {
      setIsNotionChecking(false);
    }
  };

  const allItems = categories.flatMap((category) => category.items);
  const senderName =
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress?.trim() ||
    "未ログインユーザー";
  const unlockedRuleItems = rules
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
    .map((rule) => ({
      id: rule.id,
      title: rule.targetType === "message" ? "返信文" : rule.targetLabel,
      targetType: rule.targetType === "message" ? "message" : "extra",
    }));
  const remainingCount = allItems.filter((item) => !checked[item.id]).length;
  const allChecked = allItems.length > 0 && remainingCount === 0;
  const isSendVisible = mode === "high" || mode === "low";
  const isSendEnabled = mode === "high" ? !isSending : formatDone && !isSending;
  return (
    <div className="flex flex-1 bg-zinc-50">
      <AppSidebarNavigation activePage="checklist" />

      <main className="flex w-full flex-1 justify-center px-4 py-6 sm:px-6 sm:py-10 lg:ml-64 lg:py-12">
        <div className="flex w-full max-w-2xl flex-col gap-6 px-1 sm:gap-8 sm:px-0">
        <AppMobileNavigation activePage="checklist" />
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            モード選択（自走度）
          </h2>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "high", label: "自走度：高" },
              { id: "low", label: "自走度：低" },
            ].map((option) => {
              const isActive = mode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleModeChange(option.id as "high" | "low")}
                  className={`min-h-11 rounded-md px-4 py-2 text-sm transition ${
                    isActive
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 text-zinc-900 hover:bg-zinc-100"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-zinc-900">
            現在モード：
            {mode === "high" ? "高" : "低"}
          </p>
        </section>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              今日のチェックリスト
            </h1>
            <p className="text-sm text-zinc-900">
              選択ツール: {dataDestination}
            </p>
          </div>
          <Link
            href="/admin"
            className="mt-1 text-xs text-zinc-900 underline-offset-2 hover:text-zinc-900 hover:underline"
          >
            ⚙️ 管理画面
          </Link>
        </div>

        {mode === "low" ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex min-h-80 flex-col gap-4">
              <p className="text-sm text-zinc-900">
                自走度：低モード（チャット入力）- 入力送信後に Notion 照合と文章整形を実行します。
              </p>

              <div className="flex flex-1 flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                {lowModeChatMessages.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    下の入力欄から報連相を送ると、AIの返答がここに表示されます。
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {lowModeChatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm ${
                          message.role === "user"
                            ? "self-end bg-zinc-900 text-white"
                            : "self-start border border-blue-100 bg-white text-zinc-900"
                        }`}
                      >
                        {message.content}
                      </div>
                    ))}
                  </div>
                )}

                {isLowModeProcessing ? (
                  <p className="text-sm text-blue-700">
                    AI処理中...（Notion取得 -&gt; 抜け漏れ検知 -&gt; 文章整形）
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={lowModeInput}
                    onChange={(event) => setLowModeInput(event.target.value)}
                    placeholder="報連相を自由記述で入力..."
                    rows={3}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={handleLowModeChatSubmit}
                    disabled={isLowModeProcessing || lowModeInput.trim() === ""}
                    aria-label="チャット送信"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-lg text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ➤
                  </button>
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900">
                <p>保存先: {dataDestination}</p>
                <p>通知先: {reportDestination}</p>
              </div>

              <button
                type="button"
                onClick={handleSaveToSheet}
                disabled={!isSendEnabled}
                className="min-h-11 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
              >
                {isSending ? "スプレッドシートに保存中..." : "LINE送信"}
              </button>

              {!formatDone ? (
                <p className="text-sm text-amber-700">
                  物理ロック中：AI整形結果が表示されるまでLINE送信できません。
                </p>
              ) : null}
            </div>
            {formatError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formatError}
              </div>
            ) : null}
            {sendError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {sendError}
              </div>
            ) : null}
            {sendSuccess ? (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {sendSuccess}
              </div>
            ) : null}
          </section>
        ) : (
          <>
            <section className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-900">
                  大項目
                </h2>
              </div>

              <div className="mt-4 space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
                <p className="text-xs text-zinc-900">大項目（記述式）</p>
                {categories.map((category, index) => (
                  <div key={`major-label-${index}`} className="flex items-center gap-2">
                    <input
                      value={category.title}
                      onChange={(event) => updateMajorCategoryLabel(index, event.target.value)}
                      placeholder={`例：大項目 ${index + 1}`}
                      className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={() => addMajorCategoryAfter(index)}
                      aria-label="大項目を追加"
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-300 text-sm text-zinc-900 hover:bg-zinc-100"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMajorCategory(index)}
                      aria-label="大項目を削除"
                      disabled={categories.length <= 1}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-300 text-sm text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      -
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {categories.map((category, index) => (
              <section key={category.id} className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-zinc-900">
                  {category.title.trim() || `大項目 ${index + 1}`}
                </h2>
                <ul className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4">
                  {category.items.map((item) => (
                    <li key={item.id}>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-1 items-center gap-3">
                          <input
                            type="checkbox"
                            checked={!!checked[item.id]}
                            onChange={() => toggleItem(item.id)}
                            className="h-5 w-5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600"
                          />
                          <input
                            value={item.label}
                            onChange={(event) =>
                              updateChecklistItemLabel(category.id, item.id, event.target.value)
                            }
                            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => addChecklistItem(category.id, item.id)}
                          aria-label="項目を追加"
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-300 text-sm text-zinc-900 hover:bg-zinc-100"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeChecklistItem(category.id, item.id)}
                          aria-label="項目を削除"
                          disabled={category.items.length <= 1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-300 text-sm text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
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
                <h2 className="text-lg font-semibold text-zinc-900">
                  ルール解除で追加された項目
                </h2>
                <div className="rounded-lg border border-zinc-200 bg-white p-4">
                  {unlockedRuleItems.length > 0 ? (
                    <ul className="space-y-2">
                      {unlockedRuleItems.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center gap-2 text-sm text-zinc-900"
                        >
                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-900">
                            {item.targetType === "message"
                              ? "返信文"
                              : "自由入力項目"}
                          </span>
                          <span>{renderWithAutoLinks(item.title)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-zinc-900">
                      条件を満たすと、ここに追加項目が下から積み上がって表示されます。
                    </p>
                  )}
                </div>
              </section>
            ) : null}

            {allChecked ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-zinc-900">
                  送信文
                </h2>
                <div className="rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="message-input"
                        className="text-sm font-medium text-zinc-900"
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
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleFormatMessage}
                        disabled={isFormatting || draftMessage.trim() === ""}
                        className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        {isFormatting ? "AI整形中..." : "AIで整形する"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCheckOmissionsFromNotion}
                        disabled={isNotionChecking}
                        className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isNotionChecking ? "Notionと照合中..." : "✨ Notionメモから抜け漏れをチェック"}
                      </button>
                      <label className="flex items-center gap-2 text-sm text-zinc-900">
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
                      {omissionError ? (
                        <span className="text-sm text-red-600">{omissionError}</span>
                      ) : null}
                    </div>
                    {omissionFeedback ? (
                      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                        <p className="mb-1 font-medium">AIチェック結果</p>
                        <pre className="whitespace-pre-wrap font-sans">{omissionFeedback}</pre>
                      </div>
                    ) : null}
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900">
                      <p>保存先: {dataDestination}</p>
                      <p>通知先: {reportDestination}</p>
                    </div>

                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                      <p className="mb-2 text-sm font-medium text-zinc-900">
                        整形結果
                      </p>
                      <pre className="whitespace-pre-wrap font-sans text-zinc-900">
                        {formattedMessage}
                      </pre>
                    </div>

                    {isSendVisible ? (
                      <button
                        type="button"
                        onClick={handleSaveToSheet}
                        disabled={!isSendEnabled}
                        className="min-h-11 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
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
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
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
