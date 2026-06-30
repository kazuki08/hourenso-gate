# 報連相Gate Cursor作業ガイド（Phase 1優先）

このファイルは、Cursorでの実装・改修を最短で進めるための共通指示書です。  
期限は **2026/07/11**、まずは **リーンMVP（Phase 1）達成** を最優先にします。

> 役割分担: `AGENTS.md` は「短い必須ルール」、`CURSOR.md` は「詳細手順」の一次情報。

---

## 1. 目的

- 現場の報連相コスト削減
- 上司の確認・教育コスト削減
- Invisible UI（ユーザーは新しい画面操作を覚えない）

Phase 1では、**LINEトーク内で完結する業務フロー** を完成させる。

---

## 2. Phase 1 スコープ（やること）

- Next.js API Routes でWebhook/AI/通知処理を構築（iPaaS不使用）
- Notionから「今日更新されたメモ」を取得
- LINEで「日報作成」トリガーを受け、AIドラフトを返信
- ユーザーがLINEで手直し返信した文章を「確定版」として転送
- LINE送信を中心に動作させる（Slack/SMSはスタブ可）

---

## 3. Phase 1 スコープ外（やらないこと）

- SaaS外販向けの完全なテナント分離
- 大規模なユーザー登録画面
- AI傾向分析、翌朝リマインド等の高度分析

---

## 4. 想定フロー（MVP）

1. ユーザーが業務中にNotionへメモ
2. LINEで「日報作成」を送信
3. システムがNotion情報＋専用プロンプトを取得
4. Geminiでドラフト生成しLINE返信
5. ユーザーがコピペ編集してLINE返信
6. 返信を確定版として認識し、上司などへ転送

---

## 5. 実装タスク優先順位

### P0（最優先）

1. `app/api/webhook/line/route.ts`
   - `message`, `follow`, `join` を安定処理
   - 署名検証（`x-line-signature`）必須
   - 「日報作成」判定と、通常返信（確定版候補）判定

2. Notion取得
   - ユーザーの当日更新メモを取得するロジック
   - 0件時もユーザー向けガイダンス返信で継続

3. AI生成
   - Notion内容＋専用プロンプトでドラフト生成
   - 失敗時フォールバック文面を返し、処理停止しない

4. 確定版転送
   - 直前ドラフト状態をユーザー単位で保持
   - 次の返信を確定版と見なして転送
   - 転送後は状態をクリア

### P1（余力）

- Slack/SMS通知の拡張口を実装（スタブで可）
  - `notifyToLine()`
  - `notifyToSlack()`（stub）
  - `notifyToSms()`（stub）

---

## 6. 受け入れ基準（Acceptance Criteria）

- [ ] LINEで「日報作成」送信時にドラフトが返る
- [ ] 手直し返信が確定版として転送される
- [ ] 署名不正Webhookを拒否できる
- [ ] Notionデータ0件/AI失敗時にもLINE返信が返る
- [ ] 既存主要導線（`/checklist`, `/admin`, `/dashboard`）を壊さない
- [ ] `npm run build` が通る

---

## 7. 環境変数チェック（最低限）

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `NOTION_API_KEY`
- `NOTION_TEST_PAGE_ID`（または対象DB/ページID）
- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `NEXT_PUBLIC_SPREADSHEET_ID`

不足時は `missing_env_vars` のみで終わらず、**不足キー名を明示** すること。

---

## 8. 変更時のルール

- 既存APIの責務を壊さない
- エラー時はユーザー向け文面を返す（落としっぱなし禁止）
- 既存UIは維持し、MVP達成に不要な大改修はしない
- 変更後は必ず:
  1. `npm run build`
  2. 主要APIの疎通確認
  3. 影響範囲メモを残す

---

## 9. Cursor依頼テンプレ（コピペ用）

```md
あなたはこのリポジトリの実装担当です。
目的は2026/07/11までにPhase 1 MVP（LINEトーク内完結）を完成させることです。

優先タスク:
1. LINE webhookで「日報作成」→ドラフト生成
2. 通常返信を確定版として認識して転送
3. Notion 0件/AI失敗時も処理継続
4. buildを通し、既存導線を壊さない

作業後、変更ファイル一覧・理由・検証結果を報告してください。
```

