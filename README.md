# 報連相Gate

報連相Gateは、Notionメモを基にLINE上で日報ドラフトを生成し、編集後の確定版を指定先へ転送するPhase 1 MVPです。

## セットアップ

1. `.env.example` を `.env.local` にコピーし、必要値を設定
2. 依存インストール
3. 開発サーバー起動

```bash
cp .env.example .env.local
npm install
npm run dev
```

開発サーバーは `http://localhost:3001` で起動します。

## Phase 1 運用手順（LINEでの日報作成〜確定版転送）

1. ユーザーがNotionに当日メモを記録
2. LINEでBotに `日報作成` と送信
3. WebhookがNotionメモ（当日更新分）を取得してAIドラフトを返信
4. ユーザーは返信文をコピー/編集し、そのままLINEで送信
5. システムは返信を確定版として認識し、`LINE_FINAL_TARGET_ID`（未設定時は `LINE_USER_ID`）へ転送
6. 確定後、同ユーザーの一時ドラフト状態はクリア

## Webhookの主要仕様

- エンドポイント: `/api/webhook/line`
- 必須イベント:
  - `message`（テキスト）
  - `follow`
  - `join`
- 署名検証:
  - `x-line-signature` を `LINE_CHANNEL_SECRET` で検証
  - 不正時は `401 invalid_signature`

## Notion取得ロジック（Phase 1）

- 優先: `NOTION_DAILY_DB_ID` がある場合、当日更新ページをDBクエリ
- fallback: `NOTION_TEST_PAGE_ID` の固定ページを読み取り
- 専用プロンプト:
  - `NOTION_PROMPT_PAGE_ID` がある場合、そのページ内容をドラフト生成時の追加指示として利用
- 取得0件時:
  - 処理は継続し、テンプレートドラフトを返却

## 通知チャネル

`lib/notifiers.ts` で通知を抽象化:

- `notifyToLine()` : 実装済み（LINE Push）
- `notifyToSlack()` : Phase 1はスタブ
- `notifyToSms()` : Phase 1はスタブ

## 動作確認（最低限）

1. `npm run build` が成功する
2. LINEで `日報作成` を送るとドラフト返信される
3. ドラフト編集後に返信すると転送される
4. 署名不正リクエストで `401` が返る
5. Notionデータ0件/AI失敗時でもユーザー向け返信が返る

## TODO（Phase 2以降）

- Slack通知の実装（現在スタブ）
- SMS通知の実装（現在スタブ）
- 一時ドラフト状態を永続ストアへ移行（現状はメモリ保持）
- 本格的なテナント分離/オンボーディング自動化
