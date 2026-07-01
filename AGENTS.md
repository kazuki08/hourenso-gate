<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:hourenso-mvp-rules -->
# Hourenso MVP Guardrails

- Deadline is `2026-07-11`; prioritize Phase 1 MVP (LINE-only flow) over broad refactors.
- Keep existing screens/flows working: `/checklist`, `/admin`, `/dashboard`.
- Verify Next.js behavior against `node_modules/next/dist/docs/` before implementation.
- Treat `app/api/webhook/line/route.ts` signature validation (`x-line-signature`) as mandatory.
- Handle `message`, `follow`, `join` events safely; avoid crash-on-error behavior.
- For missing env values, return actionable `missing_env_vars` with key names.
- After substantial edits, run `npm run build` and report impact briefly.
- Never include real secrets in `.env.example`; use placeholders only (`xxx`, `<REDACTED>`, sample formats).
- Before commit/push, re-check staged diff to ensure `.env.example`, docs, and logs contain no credential/token values.

詳細な実装手順・優先順位・テンプレートは `CURSOR.md` を参照すること。
<!-- END:hourenso-mvp-rules -->

## トークン効率（無駄な消費を防ぐ）
回答の質は落とさず、不要な作業・出力・思考を省いて消費を最小化する。

### 思考・確認の深さ
- 複雑な設計判断（アーキテクチャ変更、複数サービス間の連携方式決定）以外は、
  reasoning effort を上げない。Highは明示的に要求されたときだけ使う。
- 1つの変更に対して、何パターンも代替案を検討して比較しない。
  最も妥当な1つの方針を選び、理由を1〜2行だけ添えて実行する。

### 調査・確認
- タスクに直接関係するファイル・関数だけを読む。
  プロジェクト全体を毎回スキャンし直さない。
- 前回の会話で既に確認済みの情報（ファイル構成、API仕様等）を
  再確認しない。必要なら「前回確認済み」として使う。
- 外部API（LINE / Notion / Sheets）のドキュメントは、
  分からない箇所だけピンポイントで調べる。全体を読み込まない。

### 出力
- 差分表・チェックリストは、問題がある項目だけ書く。
  「一致」「問題なし」の羅列はしない。
- コード全文を貼らず、変更差分（diff）だけ示す。
- 説明文は結論から。背景説明は求められたときだけ詳しくする。
- 同じ内容を言い換えて繰り返さない。

### 実装の進め方
- 1機能ずつ実装し、都度動作確認してから次に進む
  （LINE連携→Notion連携→Sheets連携、を一度に作らない）。
- 明らかな実装（既存パターンの横展開等）は、確認を求めず実行してから報告する。
- 迷う判断（設計方針・仕様の解釈）だけ確認を求める。
