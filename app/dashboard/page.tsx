"use client";

import { useEffect, useMemo, useState } from "react";
import { AppMobileNavigation, AppSidebarNavigation } from "../app-navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type HistoryItem = {
  id: string;
  sentAt: string;
  senderName: string;
  mode: "high" | "medium" | "low";
  message: string;
};

const MODE_COLORS: Record<HistoryItem["mode"], string> = {
  high: "#3B82F6",
  medium: "#F59E0B",
  low: "#10B981",
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const ALERT_KEYWORDS = ["相談あり", "遅延", "トラブル", "詰まり", "リスク", "確認が必要"];

function formatSentAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "日時不明";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function modeLabel(mode: HistoryItem["mode"]) {
  if (mode === "medium") return "中";
  if (mode === "low") return "低";
  return "高";
}

function modeClass(mode: HistoryItem["mode"]) {
  if (mode === "medium") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  }
  if (mode === "low") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  }
  return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
}

function isWithinDays(sentAt: string, days: number) {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return false;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return date >= threshold;
}

export default function DashboardPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch("/api/history", { cache: "no-store" });
        const data = (await response.json()) as {
          ok?: boolean;
          items?: HistoryItem[];
          error?: string;
        };

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "history_fetch_failed");
        }
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error ? fetchError.message : "履歴の取得に失敗しました。"
        );
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, []);

  const filteredItems = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) =>
        item.senderName.toLowerCase().includes(term) ||
        item.message.toLowerCase().includes(term)
    );
  }, [items, keyword]);

  const recentModeData = useMemo(() => {
    const source = items.filter((item) => isWithinDays(item.sentAt, 30));
    const total = source.length;
    const count = { high: 0, medium: 0, low: 0 };
    source.forEach((item) => {
      count[item.mode] += 1;
    });
    return [
      { name: "高", key: "high", value: count.high, ratio: total > 0 ? Math.round((count.high / total) * 100) : 0 },
      {
        name: "中",
        key: "medium",
        value: count.medium,
        ratio: total > 0 ? Math.round((count.medium / total) * 100) : 0,
      },
      { name: "低", key: "low", value: count.low, ratio: total > 0 ? Math.round((count.low / total) * 100) : 0 },
    ];
  }, [items]);

  const weeklyActivityData = useMemo(() => {
    const base = WEEKDAY_LABELS.map((label, index) => ({
      weekday: label,
      order: index,
      count: 0,
    }));
    items
      .filter((item) => isWithinDays(item.sentAt, 7))
      .forEach((item) => {
        const date = new Date(item.sentAt);
        if (!Number.isNaN(date.getTime())) {
          base[date.getDay()].count += 1;
        }
      });
    return base;
  }, [items]);

  const alertItems = useMemo(() => {
    return items
      .filter((item) =>
        ALERT_KEYWORDS.some((keywordWord) => item.message.includes(keywordWord))
      )
      .slice(0, 5);
  }, [items]);

  return (
    <div className="flex flex-1 bg-zinc-50 dark:bg-black">
      <AppSidebarNavigation activePage="dashboard" />

      <main className="flex w-full flex-1 justify-center px-4 py-6 sm:px-6 sm:py-10 lg:ml-64 lg:py-12">
        <div className="w-full max-w-4xl">
          <AppMobileNavigation activePage="dashboard" />
          <section className="mb-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                最近の自走度バランス
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                直近30日の報告モード比率
              </p>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={recentModeData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={86}
                      paddingAngle={3}
                    >
                      {recentModeData.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={MODE_COLORS[entry.key as HistoryItem["mode"]]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {recentModeData.map((entry) => (
                  <div
                    key={entry.key}
                    className="rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-700"
                  >
                    <p className="font-medium text-zinc-700 dark:text-zinc-200">{entry.name}</p>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      {entry.value}件 / {entry.ratio}%
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                曜日別アクティビティ
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                直近7日間の報告件数
              </p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyActivityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="weekday" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366F1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>

          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900/40 dark:bg-red-950/30">
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">
              要確認アラート
            </h2>
            {alertItems.length === 0 ? (
              <p className="mt-2 text-sm text-red-600/80 dark:text-red-300/80">
                現在、要確認キーワードを含む報告はありません。
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {alertItems.map((item) => (
                  <li key={item.id} className="rounded-lg bg-white/80 p-3 dark:bg-black/20">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatSentAt(item.sentAt)} / {item.senderName}
                    </p>
                    <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                      {item.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              送信履歴ダッシュボード
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              過去の報連相をタイムライン形式で確認できます。
            </p>

            <div className="mt-4">
              <input
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="送信者名・内容で検索"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <section className="mt-6 space-y-4">
            {isLoading ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                履歴を読み込んでいます...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
                履歴の読み込みに失敗しました: {error}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                該当する履歴がありません。
              </div>
            ) : (
              filteredItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      送信日時: {formatSentAt(item.sentAt)}
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${modeClass(item.mode)}`}
                    >
                      モード: {modeLabel(item.mode)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    送信者: {item.senderName}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {item.message}
                  </p>
                </article>
              ))
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
