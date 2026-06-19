"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
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
  const [lineRecipientType, setLineRecipientType] = useState<"user" | "group">("user");
  const [lineLinkStatus, setLineLinkStatus] = useState<LineLinkStatus>({ linked: false });
  const [lineLinkMessage, setLineLinkMessage] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  return (
    <div className="flex flex-1 bg-zinc-50 dark:bg-black">
      <aside className="hidden lg:fixed lg:bottom-0 lg:left-0 lg:top-16 lg:flex lg:h-[calc(100vh-4rem)] lg:w-64 lg:flex-col lg:border-r lg:border-zinc-200 lg:bg-white lg:p-6 dark:lg:border-zinc-800 dark:lg:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          ナビゲーション
        </h2>
        <nav className="mt-4 flex flex-col gap-2 text-sm">
          <Link
            href="/checklist"
            className="rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            チェックリスト
          </Link>
          <span className="rounded-md bg-zinc-100 px-3 py-2 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
            管理画面
          </span>
        </nav>
      </aside>

      <main className="flex w-full flex-1 justify-center px-4 py-6 sm:px-6 sm:py-10 lg:ml-64 lg:py-12">
        <div className="w-full max-w-5xl space-y-6">
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
                  <Link
                    href="/checklist"
                    className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    チェックリスト
                  </Link>
                  <span className="rounded-md bg-zinc-100 px-3 py-2 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                    管理画面
                  </span>
                </nav>
              </div>
            ) : null}
          </div>

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
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              + ルールを追加
            </button>
          </div>

          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            表示対象は「返信文（固定）」または「自由入力」を選択できます。自由入力を選ぶとタイトル入力欄が表示されます。
          </p>

          <div className="space-y-3">
            {visibilityRules.map((rule, index) => (
              <div key={rule.id} className="grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]">
                <div className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    トリガー項目（複数選択）
                  </p>
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1">
                    {checklistSelectOptions.map((label) => {
                      const checked = rule.triggerLabels.includes(label);
                      return (
                        <label
                          key={`trigger-${rule.id}-${label}`}
                          className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              toggleRuleTrigger(index, label, event.target.checked)
                            }
                            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-600"
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                    {checklistSelectOptions.length === 0 ? (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
                  className="appearance-none rounded-md border border-zinc-300 px-3 py-2 pr-10 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                ) : (
                  <input
                    value="返信文"
                    readOnly
                    className="rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addRuleAfter(index)}
                    aria-label="ルールを追加"
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRule(index)}
                    aria-label="ルールを削除"
                    disabled={visibilityRules.length <= 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    -
                  </button>
                </div>
              </div>
            ))}
            {checklistSelectOptions.length === 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                チェックリスト項目が見つかりません。チェックリスト画面で項目を追加するとここに反映されます。
              </p>
            ) : null}
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

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            LINE送信先設定
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            個人宛（上司など）か、LINEグループ宛かを選択します。
          </p>

          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="line-recipient-type"
                value="user"
                checked={lineRecipientType === "user"}
                onChange={() => setLineRecipientType("user")}
                className="h-4 w-4 border-zinc-300 text-zinc-900 dark:border-zinc-600"
              />
              個人宛に送る
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="line-recipient-type"
                value="group"
                checked={lineRecipientType === "group"}
                onChange={() => setLineRecipientType("group")}
                className="h-4 w-4 border-zinc-300 text-zinc-900 dark:border-zinc-600"
              />
              グループ宛に送る
            </label>
          </div>

          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
            <p className="font-medium text-zinc-800 dark:text-zinc-100">現在の紐付け状態</p>
            {lineLinkStatus.linked &&
            lineLinkStatus.recipientType === lineRecipientType ? (
              <div className="mt-1 space-y-1 text-zinc-700 dark:text-zinc-300">
                <p className="text-emerald-700 dark:text-emerald-400">設定済み</p>
                <p>ID: {lineLinkStatus.lineId}</p>
                <p>
                  種別: {lineLinkStatus.recipientType === "user" ? "個人ID" : "グループID"}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-amber-700 dark:text-amber-300">未設定</p>
            )}
            {lineLinkMessage ? (
              <p className="mt-2 text-red-600 dark:text-red-400">{lineLinkMessage}</p>
            ) : null}
          </div>

          <div className="mt-4 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-700">
            <p className="font-medium text-zinc-800 dark:text-zinc-100">連携導線（QR/リンク）</p>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Botを友だち追加（個人）またはグループへ招待した後、WebhookでIDが自動登録されます。
            </p>
            <div className="mt-3 space-y-2">
              {lineAddFriendUrl ? (
                <a
                  href={lineAddFriendUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  友だち追加リンクを開く
                </a>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400">
                  `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` を設定するとリンクが表示されます。
                </p>
              )}
              {lineQrImageUrl ? (
                <div>
                  <img
                    src={lineQrImageUrl}
                    alt="LINE友だち追加QRコード"
                    className="h-36 w-36 rounded border border-zinc-200 object-contain dark:border-zinc-700"
                  />
                </div>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400">
                  `NEXT_PUBLIC_LINE_QR_IMAGE_URL` を設定するとQRコード画像を表示できます。
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-md border border-dashed border-zinc-300 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            <p>Webhook URL（Clerkユーザー紐付け用）</p>
            <code className="mt-1 block break-all">{webhookSetupUrl}</code>
          </div>
        </section>

        </div>
      </main>
    </div>
  );
}
