"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  ALL_TOOLS_ID,
  CHECKLIST_TEMPLATES_STORAGE_KEY,
  LEGACY_ADMIN_SETTINGS_STORAGE_KEY,
  LINE_DESTINATION_SETTINGS_STORAGE_KEY,
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
      trigger: "",
      target: "",
    },
  ]);
  const [saveMessage, setSaveMessage] = useState("");
  const [lineRecipientType, setLineRecipientType] = useState<"user" | "group">("user");
  const [lineLinkStatus, setLineLinkStatus] = useState<LineLinkStatus>({ linked: false });
  const [lineLinkMessage, setLineLinkMessage] = useState("");
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
    localStorage.setItem(LINE_DESTINATION_SETTINGS_STORAGE_KEY, lineRecipientType);
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
