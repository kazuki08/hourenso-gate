"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AppMobileNavigation, AppSidebarNavigation } from "../app-navigation";
import {
  AI_FORMAT_PROMPT_STORAGE_KEY,
  ALL_TOOLS_ID,
  CHECKLIST_TEMPLATES_STORAGE_KEY,
  LEGACY_ADMIN_SETTINGS_STORAGE_KEY,
  LINE_DESTINATION_SETTINGS_STORAGE_KEY,
  USER_TODAY_PROGRESS_STORAGE_KEY_PREFIX,
  type ChecklistTemplateSettings,
  createClientId,
  type TemplateChecklistItem,
  type TemplateTool,
  type TemplateVisibilityRule,
} from "../template-storage";
import { DEFAULT_AI_FORMAT_PROMPT } from "../../lib/prompts";

type AdminToolForm = TemplateTool;
type AdminChecklistItemForm = {
  id: string;
  title: string;
  toolId: string;
};
type AdminRuleForm = {
  id: string;
  toolId: string;
  triggerLabels: string[];
  targetType: "extra" | "message";
  target: string;
};

type LineLinkStatus =
  | {
      linked: false;
    }
  | {
      linked: true;
      lineId: string;
      recipientType: "user" | "group";
      linkedAt: string;
    };

export default function AdminPage() {
  const selectChevronStyle = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%236b7280' stroke-width='1.5'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0.75rem center",
    backgroundSize: "0.9rem",
  } as const;

  const { user } = useUser();
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
      triggerLabels: [],
      targetType: "extra",
      target: "",
    },
  ]);
  const [saveMessage, setSaveMessage] = useState("");
  const [aiFormatPrompt, setAiFormatPrompt] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_AI_FORMAT_PROMPT;
    }
    const savedPrompt = localStorage.getItem(AI_FORMAT_PROMPT_STORAGE_KEY);
    return savedPrompt ?? DEFAULT_AI_FORMAT_PROMPT;
  });
  const [aiPromptSaveMessage, setAiPromptSaveMessage] = useState("");
  const [lineRecipientType, setLineRecipientType] = useState<"user" | "group">("user");
  const [lineLinkStatus, setLineLinkStatus] = useState<LineLinkStatus>({ linked: false });
  const [lineLinkMessage, setLineLinkMessage] = useState("");
  const [checklistSelectOptions, setChecklistSelectOptions] = useState<string[]>([]);
  const lineAddFriendUrl = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL || "";
  const lineQrImageUrl = process.env.NEXT_PUBLIC_LINE_QR_IMAGE_URL || "";
  const webhookSetupUrl = user
    ? `/api/webhook/line?clerkUserId=${encodeURIComponent(user.id)}`
    : "/api/webhook/line?clerkUserId=<YOUR_CLERK_USER_ID>";

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
          triggerLabels?: string[];
          triggerLabel?: string;
          trigger?: string;
          targetLabel?: string;
          target?: string;
          targetType?: "extra" | "message";
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
            triggerLabels: Array.isArray(rule.triggerLabels)
              ? rule.triggerLabels.filter((label) => label.trim() !== "")
              : rule.triggerLabel?.trim()
                ? [rule.triggerLabel.trim()]
                  : [],
            targetType: rule.targetType === "message" ? "message" : "extra",
            target: rule.targetType === "message" ? "返信文" : (rule.targetLabel ?? ""),
          }))
        );
      }
    } catch {
      // 保存データが壊れている場合は既定値のまま表示する
    }
  }, []);

  useEffect(() => {
    if (!aiPromptSaveMessage) return;
    const timerId = window.setTimeout(() => {
      setAiPromptSaveMessage("");
    }, 3000);
    return () => window.clearTimeout(timerId);
  }, [aiPromptSaveMessage]);

  useEffect(() => {
    const loadChecklistOptions = () => {
      const optionSet = new Set<string>();

      const templateJson =
        localStorage.getItem(CHECKLIST_TEMPLATES_STORAGE_KEY) ??
        localStorage.getItem(LEGACY_ADMIN_SETTINGS_STORAGE_KEY);
      if (templateJson) {
        try {
          const parsed = JSON.parse(templateJson) as Partial<ChecklistTemplateSettings>;
          if (Array.isArray(parsed.checklistItems)) {
            parsed.checklistItems.forEach((item) => {
              const label = item.label?.trim();
              if (label) {
                optionSet.add(label);
              }
            });
          }
        } catch {
          // 破損データは無視
        }
      }

      // チェックリスト画面で増減した「実運用の項目」も反映
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("checklist_master_edit-")) {
          continue;
        }

        const raw = localStorage.getItem(key);
        if (!raw) {
          continue;
        }

        try {
          const categories = JSON.parse(raw) as Array<{
            items?: Array<{ label?: string }>;
          }>;
          categories.forEach((category) => {
            category.items?.forEach((item) => {
              const label = item.label?.trim();
              if (label) {
                optionSet.add(label);
              }
            });
          });
        } catch {
          // 破損データは無視
        }
      }

      const nextOptions = Array.from(optionSet);
      setChecklistSelectOptions((prev) =>
        prev.length === nextOptions.length &&
        prev.every((value, index) => value === nextOptions[index])
          ? prev
          : nextOptions
      );
    };

    loadChecklistOptions();

    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (
        event.key.startsWith("checklist_master_edit-") ||
        event.key.startsWith(USER_TODAY_PROGRESS_STORAGE_KEY_PREFIX) ||
        event.key === CHECKLIST_TEMPLATES_STORAGE_KEY ||
        event.key === LEGACY_ADMIN_SETTINGS_STORAGE_KEY
      ) {
        loadChecklistOptions();
      }
    };

    window.addEventListener("storage", onStorage);
    const intervalId = window.setInterval(loadChecklistOptions, 1500);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const savedType = localStorage.getItem(LINE_DESTINATION_SETTINGS_STORAGE_KEY);
    if (savedType === "user" || savedType === "group") {
      setLineRecipientType(savedType);
    }
  }, []);

  useEffect(() => {
    const loadLineLinkStatus = async () => {
      try {
        const response = await fetch("/api/line-link-status");
        const data = (await response.json()) as
          | { ok: true; linked: false }
          | {
              ok: true;
              linked: true;
              lineId: string;
              recipientType: "user" | "group";
              linkedAt: string;
            }
          | { ok: false; error?: string; message?: string };

        if (!response.ok || !data.ok) {
          setLineLinkMessage("LINE連携状況の取得に失敗しました");
          setLineLinkStatus({ linked: false });
          return;
        }

        if (!data.linked) {
          setLineLinkStatus({ linked: false });
          return;
        }

        setLineLinkStatus({
          linked: true,
          lineId: data.lineId,
          recipientType: data.recipientType,
          linkedAt: data.linkedAt,
        });
      } catch {
        setLineLinkMessage("LINE連携状況の取得に失敗しました");
        setLineLinkStatus({ linked: false });
      }
    };

    void loadLineLinkStatus();
  }, []);

  const updateRule = (
    index: number,
    key: keyof Pick<AdminRuleForm, "target" | "toolId" | "targetType">,
    value: string
  ) => {
    setVisibilityRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, [key]: value } : rule))
    );
  };

  const updateRuleTargetType = (index: number, targetType: "extra" | "message") => {
    setVisibilityRules((prev) =>
      prev.map((rule, i) => {
        if (i !== index) return rule;
        if (targetType === "message") {
          return { ...rule, targetType, target: "返信文" };
        }
        return {
          ...rule,
          targetType,
          target: rule.target === "返信文" ? "" : rule.target,
        };
      })
    );
  };

  const toggleRuleTrigger = (index: number, label: string, checked: boolean) => {
    setVisibilityRules((prev) =>
      prev.map((rule, i) => {
        if (i !== index) return rule;
        const next = checked
          ? Array.from(new Set([...rule.triggerLabels, label]))
          : rule.triggerLabels.filter((triggerLabel) => triggerLabel !== label);
        return { ...rule, triggerLabels: next };
      })
    );
  };

  const addRuleAfter = (index: number) => {
    setVisibilityRules((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, {
        id: createClientId("rule"),
        toolId: ALL_TOOLS_ID,
        triggerLabels: [],
        targetType: "extra",
        target: "",
      });
      return next;
    });
  };

  const removeRule = (index: number) => {
    setVisibilityRules((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, ruleIndex) => ruleIndex !== index);
    });
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
        triggerLabels: rule.triggerLabels.map((label) => label.trim()).filter(Boolean),
        targetLabel: rule.targetType === "message" ? "返信文" : rule.target.trim(),
        targetType: rule.targetType,
      }))
      .filter((rule) => rule.triggerLabels.length > 0 && rule.targetLabel !== "");

    const settings: ChecklistTemplateSettings = {
      tools: normalizedTools,
      checklistItems: normalizedChecklistItems,
      visibilityRules: normalizedVisibilityRules,
    };

    localStorage.setItem(CHECKLIST_TEMPLATES_STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem(LINE_DESTINATION_SETTINGS_STORAGE_KEY, lineRecipientType);
    setSaveMessage("設定を保存しました");
  };

  const saveAiFormatPrompt = () => {
    localStorage.setItem(AI_FORMAT_PROMPT_STORAGE_KEY, aiFormatPrompt);
    setAiPromptSaveMessage("保存しました");
  };

  return (
    <div className="flex flex-1 bg-zinc-50">
      <AppSidebarNavigation activePage="admin" />

      <main className="flex w-full flex-1 justify-center px-4 py-6 sm:px-6 sm:py-10 lg:ml-64 lg:py-12">
        <div className="w-full max-w-5xl space-y-6">
          <AppMobileNavigation activePage="admin" />

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-zinc-900">
              管理画面
            </h1>
            <p className="text-sm text-zinc-900">
              SaaS化に向けた設定UIのモックです
            </p>
          </div>
          <Link
            href="/"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-100"
          >
            ユーザー画面（チェックリスト）へ戻る
          </Link>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">
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
                    triggerLabels: [],
                    targetType: "extra",
                    target: "",
                  },
                ])
              }
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 hover:bg-zinc-100"
            >
              + ルールを追加
            </button>
          </div>

          <p className="mb-3 text-sm text-zinc-900">
            表示対象は「返信文（固定）」または「自由入力」を選択できます。自由入力を選ぶとタイトル入力欄が表示されます。
          </p>

          <div className="space-y-3">
            {visibilityRules.map((rule, index) => (
              <div key={rule.id} className="grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]">
                <div className="rounded-md border border-zinc-300 px-3 py-2">
                  <p className="text-xs text-zinc-900">
                    トリガー項目（複数選択）
                  </p>
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1">
                    {checklistSelectOptions.map((label) => {
                      const checked = rule.triggerLabels.includes(label);
                      return (
                        <label
                          key={`trigger-${rule.id}-${label}`}
                          className="flex items-center gap-2 text-sm text-zinc-900"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              toggleRuleTrigger(index, label, event.target.checked)
                            }
                            className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                    {checklistSelectOptions.length === 0 ? (
                      <p className="text-xs text-zinc-900">
                        選択可能な項目がありません
                      </p>
                    ) : null}
                  </div>
                </div>
                <select
                  value={rule.targetType}
                  onChange={(event) =>
                    updateRuleTargetType(index, event.target.value as "extra" | "message")
                  }
                  className="appearance-none rounded-md border border-zinc-300 px-3 py-2 pr-10 text-sm text-zinc-900"
                  style={selectChevronStyle}
                >
                  <option value="message">返信文（固定）</option>
                  <option value="extra">自由入力</option>
                </select>
                {rule.targetType === "extra" ? (
                  <input
                    value={rule.target}
                    onChange={(event) => updateRule(index, "target", event.target.value)}
                    placeholder="表示タイトル（例：必要なURL・追加要素）"
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-900"
                  />
                ) : (
                  <input
                    value="返信文"
                    readOnly
                    className="rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-900"
                  />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addRuleAfter(index)}
                    aria-label="ルールを追加"
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-300 text-sm text-zinc-900 hover:bg-zinc-100"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRule(index)}
                    aria-label="ルールを削除"
                    disabled={visibilityRules.length <= 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-300 text-sm text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    -
                  </button>
                </div>
              </div>
            ))}
            {checklistSelectOptions.length === 0 ? (
              <p className="text-sm text-amber-700">
                チェックリスト項目が見つかりません。チェックリスト画面で項目を追加するとここに反映されます。
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-zinc-900">AI整形プロンプト設定</h2>
          <div className="mt-4">
            <label
              htmlFor="ai-format-prompt"
              className="mb-2 block text-sm font-medium text-zinc-900"
            >
              AI整形プロンプト（報連相の整形ルール）
            </label>
            <textarea
              id="ai-format-prompt"
              value={aiFormatPrompt}
              onChange={(event) => setAiFormatPrompt(event.target.value)}
              rows={10}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              placeholder={DEFAULT_AI_FORMAT_PROMPT}
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={saveAiFormatPrompt}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                保存
              </button>
              {aiPromptSaveMessage ? (
                <span className="text-sm text-emerald-700">{aiPromptSaveMessage}</span>
              ) : null}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveSettings}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            設定を保存
          </button>
          {saveMessage ? (
            <span className="text-sm text-emerald-700">
              {saveMessage}
            </span>
          ) : null}
        </div>

        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-zinc-900">
            LINE送信先設定
          </h2>
          <p className="mt-2 text-sm text-zinc-900">
            個人宛（上司など）か、LINEグループ宛かを選択します。
          </p>

          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-900">
              <input
                type="radio"
                name="line-recipient-type"
                value="user"
                checked={lineRecipientType === "user"}
                onChange={() => setLineRecipientType("user")}
                className="h-4 w-4 border-zinc-300 text-zinc-900"
              />
              個人宛に送る
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-900">
              <input
                type="radio"
                name="line-recipient-type"
                value="group"
                checked={lineRecipientType === "group"}
                onChange={() => setLineRecipientType("group")}
                className="h-4 w-4 border-zinc-300 text-zinc-900"
              />
              グループ宛に送る
            </label>
          </div>

          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <p className="font-medium text-zinc-900">現在の紐付け状態</p>
            {lineLinkStatus.linked &&
            lineLinkStatus.recipientType === lineRecipientType ? (
              <div className="mt-1 space-y-1 text-zinc-900">
                <p className="text-emerald-700">設定済み</p>
                <p>ID: {lineLinkStatus.lineId}</p>
                <p>
                  種別: {lineLinkStatus.recipientType === "user" ? "個人ID" : "グループID"}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-amber-700">未設定</p>
            )}
            {lineLinkMessage ? (
              <p className="mt-2 text-red-600">{lineLinkMessage}</p>
            ) : null}
          </div>

          <div className="mt-4 rounded-md border border-zinc-200 p-3 text-sm">
            <p className="font-medium text-zinc-900">連携導線（QR/リンク）</p>
            <p className="mt-2 text-zinc-900">
              Botを友だち追加（個人）またはグループへ招待した後、WebhookでIDが自動登録されます。
            </p>
            <div className="mt-3 space-y-2">
              {lineAddFriendUrl ? (
                <a
                  href={lineAddFriendUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 hover:bg-zinc-100"
                >
                  友だち追加リンクを開く
                </a>
              ) : (
                <p className="text-zinc-900">
                  `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` を設定するとリンクが表示されます。
                </p>
              )}
              {lineQrImageUrl ? (
                <div>
                  <img
                    src={lineQrImageUrl}
                    alt="LINE友だち追加QRコード"
                    className="h-36 w-36 rounded border border-zinc-200 object-contain"
                  />
                </div>
              ) : (
                <p className="text-zinc-900">
                  `NEXT_PUBLIC_LINE_QR_IMAGE_URL` を設定するとQRコード画像を表示できます。
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-md border border-dashed border-zinc-300 p-3 text-xs text-zinc-900">
            <p>Webhook URL（Clerkユーザー紐付け用）</p>
            <code className="mt-1 block break-all">{webhookSetupUrl}</code>
          </div>
        </section>

        </div>
      </main>
    </div>
  );
}
