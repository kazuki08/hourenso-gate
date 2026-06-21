"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
const INTEGRATION_SETTINGS_STORAGE_KEY = "integration_settings";

const dataDestinationOptions = [
  { value: "google-sheets", label: "Googleスプレッドシート" },
  { value: "notion-db", label: "Notionデータベース" },
  { value: "csv-export", label: "CSV出力" },
];

const reportDestinationOptions = [
  { value: "line", label: "公式LINE" },
  { value: "slack", label: "Slack" },
  { value: "chatwork", label: "Chatwork" },
];

export default function Home() {
  const router = useRouter();
  const [dataDestination, setDataDestination] = useState("");
  const [reportDestination, setReportDestination] = useState("");

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
      // 破損データ時は既定値のまま表示
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      INTEGRATION_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        dataDestination,
        reportDestination,
      })
    );
  }, [dataDestination, reportDestination]);

  const handleProceed = () => {
    if (!dataDestination || !reportDestination) {
      return;
    }

    router.push("/checklist");
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-12">
      <main className="w-full max-w-4xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">
              連携先を設定
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              データ保管先と報連相の送信先を選択して、チェックリストへ進んでください
            </p>
          </div>
          <Link
            href="/admin"
            className="mt-1 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline"
          >
            ⚙️ 管理設定
          </Link>
        </div>

        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-sm">
                  🗂️
                </span>
                <h2 className="text-sm font-semibold text-zinc-900">
                  データ保管先
                </h2>
              </div>
              <label
                htmlFor="data-destination"
                className="mb-1 block text-xs text-zinc-600"
              >
                保管システムを選択
              </label>
              <select
                id="data-destination"
                value={dataDestination}
                onChange={(event) => setDataDestination(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-300 transition focus:ring-2"
              >
                <option value="" disabled>
                  保管先を選択してください
                </option>
                {dataDestinationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-sm">
                  📣
                </span>
                <h2 className="text-sm font-semibold text-zinc-900">
                  報連相の送信先
                </h2>
              </div>
              <label
                htmlFor="report-destination"
                className="mb-1 block text-xs text-zinc-600"
              >
                通知システムを選択
              </label>
              <select
                id="report-destination"
                value={reportDestination}
                onChange={(event) => setReportDestination(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-300 transition focus:ring-2"
              >
                <option value="" disabled>
                  送信先を選択してください
                </option>
                {reportDestinationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4">
            <p className="text-xs text-zinc-500">
              選択内容はブラウザに保存され、次回アクセス時に自動で復元されます。
            </p>
            <button
              type="button"
              onClick={handleProceed}
              disabled={!dataDestination || !reportDestination}
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              次へ進む
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
