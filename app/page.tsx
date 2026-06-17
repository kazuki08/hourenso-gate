import Link from "next/link";

const tools = [
  { id: "tool-a", name: "ツールA", description: "日次報告用チェックリスト" },
  { id: "tool-b", name: "ツールB", description: "障害対応用チェックリスト" },
];

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <main className="w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            ツールを選択
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            利用する報連相ツールを選んでください（現在はモック表示です）
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <Link
              key={tool.id}
              href={`/checklist?tool=${tool.id}`}
              className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
            >
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {tool.name}
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {tool.description}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
