export type ChecklistItem = {
  id: string;
  label: string;
};

export type ChecklistCategory = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

export const checklistCategories: ChecklistCategory[] = [
  {
    id: "always",
    title: "常時",
    items: [
      { id: "always-1", label: "今日やることをタスクリストで確認した" },
      { id: "always-2", label: "進行中の依頼・宿題が残っていないか確認した" },
    ],
  },
  {
    id: "before-task",
    title: "タスク着手前",
    items: [
      { id: "before-task-1", label: "タスクのゴール・完了条件を確認した" },
      { id: "before-task-2", label: "不明点・前提の確認漏れがないか見直した" },
      { id: "before-task-3", label: "期限・優先度を確認した" },
    ],
  },
  {
    id: "before-work",
    title: "業務開始前",
    items: [
      { id: "before-work-1", label: "今日の予定・ミーティングを確認した" },
      { id: "before-work-2", label: "前日からの引き継ぎ事項を確認した" },
    ],
  },
  {
    id: "during-work",
    title: "業務中",
    items: [
      { id: "during-work-1", label: "想定外のことが起きたら都度メモしている" },
      { id: "during-work-2", label: "長時間詰まっていないか（30分ルール）確認した" },
      { id: "during-work-3", label: "途中経過を記録した" },
    ],
  },
  {
    id: "before-report",
    title: "報連相前",
    items: [
      { id: "before-report-1", label: "事実と所感を分けて整理した" },
      { id: "before-report-2", label: "確認したいこと・質問を明確にした" },
      { id: "before-report-3", label: "相談したい内容と背景を整理した" },
    ],
  },
  {
    id: "when-stuck",
    title: "困った時",
    items: [
      { id: "when-stuck-1", label: "自分で調べられる範囲は調べた" },
      { id: "when-stuck-2", label: "再現手順・状況を整理した" },
    ],
  },
  {
    id: "end-of-work",
    title: "業務終了時",
    items: [
      { id: "end-of-work-1", label: "今日の進捗・完了内容を整理した" },
      { id: "end-of-work-2", label: "明日に持ち越すタスクを明確にした" },
      { id: "end-of-work-3", label: "報連相が必要な内容を整理した" },
    ],
  },
];
