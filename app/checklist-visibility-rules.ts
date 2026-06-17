export type VisibilityRuleContent = {
  id: string;
  type: "url" | "text";
  label: string;
  value: string;
};

export type VisibilityRuleTemplate = {
  id: string;
  triggerItemId: string;
  contents: VisibilityRuleContent[];
};

// フェーズ3用のフロントエンド定数（JSON相当）
// 管理画面との永続連携は次フェーズで差し替え予定
export const visibilityRuleTemplates: VisibilityRuleTemplate[] = [
  {
    id: "rule-before-task-1",
    triggerItemId: "before-task-1",
    contents: [
      {
        id: "rule-before-task-1-url",
        type: "url",
        label: "要件確認ドキュメント",
        value: "https://example.com/requirements",
      },
      {
        id: "rule-before-task-1-note",
        type: "text",
        label: "追加確認項目",
        value: "疑問点を3つまで箇条書きで整理してから着手してください。",
      },
    ],
  },
  {
    id: "rule-during-work-2",
    triggerItemId: "during-work-2",
    contents: [
      {
        id: "rule-during-work-2-url",
        type: "url",
        label: "詰まり相談フォーム",
        value: "https://example.com/help-request",
      },
      {
        id: "rule-during-work-2-note",
        type: "text",
        label: "相談テンプレート",
        value: "現状 / 試したこと / 次に試したいこと を記入して共有してください。",
      },
    ],
  },
];

