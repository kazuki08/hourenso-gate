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
import { Flame, Rocket, Sparkles, Trophy } from "lucide-react";
import { useUser } from "@clerk/nextjs";

type HistoryItem = {
  id: string;
  sentAt: string;
  senderName: string;
  mode: "high" | "medium" | "low";
  message: string;
  userId: string;
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
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function modeLabel(mode: HistoryItem["mode"]) {
  if (mode === "medium") return "中";
  if (mode === "low") return "低";
  return "高";
}

function modeClass(mode: HistoryItem["mode"]) {
  if (mode === "medium") {
    return "bg-amber-100 text-amber-700";
  }
  if (mode === "low") {
    return "bg-emerald-100 text-emerald-700";
  }
  return "bg-blue-100 text-blue-700";
}

function isWithinDays(sentAt: string, days: number) {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return false;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return date >= threshold;
}

function isThisWeek(sentAt: string) {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return false;
  const start = new Date();
  const weekday = start.getDay();
  const diffToMonday = weekday === 0 ? 6 : weekday - 1;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToMonday);
  return date >= start;
}

function getSelfDriveRank(highModeCount: number) {
  if (highModeCount >= 20) {
    return {
      title: "自走マスター",
      icon: Trophy,
      accent: "text-yellow-600",
      bg: "bg-yellow-50",
      nextTarget: "最高ランク達成中",
    };
  }
  if (highModeCount >= 10) {
    return {
      title: "自走エキスパート",
      icon: Rocket,
      accent: "text-indigo-600",
      bg: "bg-indigo-50",
      nextTarget: `次の称号まであと${20 - highModeCount}件`,
    };
  }
  if (highModeCount >= 5) {
    return {
      title: "自走チャレンジャー",
      icon: Flame,
      accent: "text-orange-600",
      bg: "bg-orange-50",
      nextTarget: `次の称号まであと${10 - highModeCount}件`,
    };
  }
  return {
    title: "スタートアップ",
    icon: Sparkles,
    accent: "text-emerald-600",
    bg: "bg-emerald-50",
    nextTarget: `次の称号まであと${5 - highModeCount}件`,
  };
}

function splitSearchTokens(keyword: string) {
  return keyword
    .toLowerCase()
    .trim()
    .split(/[\s\u3000、。,.!！?？/／・:：;；]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeForSearch(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s\u3000、。,.!！?？/／・:：;；'"`´^~\-_[\]{}()（）「」『』【】]/g, "");
}

function expandTokenVariants(token: string) {
  const variants = new Set<string>();
  const trimmed = token.trim();
  if (!trimmed) {
    return [];
  }
  variants.add(trimmed);
  variants.add(trimmed.replace(/(など|等)$/g, ""));
  return Array.from(variants).filter(Boolean);
}

function normalizeHistoryUserId(rawUserId: string) {
  const normalized = rawUserId.trim();
  if (!normalized) {
    return "";
  }
  if (["null", "undefined", "-", "なし"].includes(normalized.toLowerCase())) {
    return "";
  }
  return normalized;
}

function matchesKeyword(item: HistoryItem, keyword: string) {
  const tokens = splitSearchTokens(keyword);
  if (tokens.length === 0) {
    return true;
  }

  const searchable = normalizeForSearch(`${item.senderName} ${item.message}`);
  return tokens.every((token) => {
    const variants = expandTokenVariants(token).map((value) => normalizeForSearch(value));
    return variants.some((variant) => variant && searchable.includes(variant));
  });
}

export default function DashboardPage() {
  const { user } = useUser();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
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
          currentUserId?: string;
          error?: string;
        };

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "history_fetch_failed");
        }
        setItems(Array.isArray(data.items) ? data.items : []);
        setCurrentUserId(typeof data.currentUserId === "string" ? data.currentUserId : "");
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

  const filteredTeamItems = useMemo(() => {
    return items.filter((item) => matchesKeyword(item, keyword));
  }, [items, keyword]);
  const myItems = useMemo(() => {
    const senderCandidates = [
      user?.fullName?.trim(),
      user?.primaryEmailAddress?.emailAddress?.trim(),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    return items.filter((item) => {
      const normalizedItemUserId = normalizeHistoryUserId(item.userId);
      const normalizedCurrentUserId = normalizeHistoryUserId(currentUserId);

      if (normalizedCurrentUserId && normalizedItemUserId === normalizedCurrentUserId) {
        return true;
      }
      if (normalizedItemUserId) {
        return false;
      }
      if (senderCandidates.length === 0) {
        return false;
      }
      const normalizedSender = item.senderName.trim().toLowerCase();
      return senderCandidates.some(
        (candidate) =>
          normalizedSender === candidate ||
          normalizedSender.includes(candidate) ||
          candidate.includes(normalizedSender)
      );
    });
  }, [items, currentUserId, user]);
  const filteredMyItems = useMemo(() => {
    return myItems.filter((item) => matchesKeyword(item, keyword));
  }, [myItems, keyword]);

  const recentModeData = useMemo(() => {
    const source = items.filter((item) => isWithinDays(item.sentAt, 30));
    const total = source.length;
    const count = { high: 0, low: 0 };
    source.forEach((item) => {
      if (item.mode === "low") {
        count.low += 1;
        return;
      }
      count.high += 1;
    });
    return [
      {
        name: "高",
        key: "high",
        value: count.high,
        ratio: total > 0 ? Math.round((count.high / total) * 100) : 0,
      },
      {
        name: "低",
        key: "low",
        value: count.low,
        ratio: total > 0 ? Math.round((count.low / total) * 100) : 0,
      },
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
  const myWeeklyCount = useMemo(
    () => myItems.filter((item) => isThisWeek(item.sentAt)).length,
    [myItems]
  );
  const myHighModeCount = useMemo(
    () => myItems.filter((item) => item.mode === "high").length,
    [myItems]
  );
  const myRank = getSelfDriveRank(myHighModeCount);
  const RankIcon = myRank.icon;

  return (
    <div className="flex flex-1 bg-gradient-to-b from-sky-50 to-white">
      <AppSidebarNavigation activePage="dashboard" />

      <main className="flex w-full flex-1 justify-center px-4 py-6 sm:px-6 sm:py-10 lg:ml-64 lg:py-12">
        <div className="w-full max-w-4xl">
          <AppMobileNavigation activePage="dashboard" />
          <section className="mb-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <h1 className="text-xl font-semibold text-zinc-900">
              送信履歴ダッシュボード
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              チーム分析と個人の振り返りを同じ画面で確認できます。
            </p>
          </section>

          <section className="mb-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-800">
                最近の自走度バランス
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
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
                    className="rounded-md border border-sky-100 px-2 py-1"
                  >
                    <p className="font-medium text-zinc-700">{entry.name}</p>
                    <p className="text-zinc-500">
                      {entry.value}件 / {entry.ratio}%
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-800">
                曜日別アクティビティ
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
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

          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-red-700">
              要確認アラート
            </h2>
            {alertItems.length === 0 ? (
              <p className="mt-2 text-sm text-red-600/80">
                現在、要確認キーワードを含む報告はありません。
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {alertItems.map((item) => (
                  <li key={item.id} className="rounded-lg bg-white p-3">
                    <p className="text-xs text-zinc-500">
                      {formatSentAt(item.sentAt)} / {item.senderName}
                    </p>
                    <p className="mt-1 text-sm text-zinc-800">
                      {item.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
              <p className="text-sm text-zinc-500">今週の振り返り</p>
              <p className="mt-3 text-3xl font-bold text-zinc-900">
                今週の報告数: {myWeeklyCount}件
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                今週送信したあなたの報連相件数です。
              </p>
            </article>
            <article
              className={`rounded-2xl border border-blue-100 p-6 shadow-sm ${myRank.bg}`}
            >
              <div className="flex items-center gap-3">
                <RankIcon className={`h-6 w-6 ${myRank.accent}`} />
                <p className="text-sm font-semibold text-zinc-800">
                  自走度レベルステータス
                </p>
              </div>
              <p className={`mt-3 text-2xl font-bold ${myRank.accent}`}>{myRank.title}</p>
              <p className="mt-2 text-sm text-zinc-600">
                高モード送信回数: {myHighModeCount}件
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {myRank.nextTarget}
              </p>
            </article>
          </section>

          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-zinc-900">
              送信履歴
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              報連相をタイムライン形式で確認できます。
            </p>
            <div className="mt-4">
              <input
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="送信者名・内容で検索"
                className="w-full rounded-lg border border-blue-100 bg-white px-4 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-blue-300 focus:outline-none"
              />
            </div>
          </div>

          <section className="mt-6 space-y-4">
            {isLoading ? (
              <div className="rounded-xl border border-blue-100 bg-white p-6 text-sm text-zinc-600">
                履歴を読み込んでいます...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                履歴の読み込みに失敗しました: {error}
              </div>
            ) : filteredTeamItems.length === 0 ? (
              <div className="rounded-xl border border-blue-100 bg-white p-6 text-sm text-zinc-600">
                該当する履歴がありません。
              </div>
            ) : (
              filteredTeamItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">
                      送信日時: {formatSentAt(item.sentAt)}
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${modeClass(item.mode)}`}
                    >
                      モード: {modeLabel(item.mode)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-zinc-800">
                    送信者: {item.senderName}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
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
