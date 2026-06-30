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

詳細な実装手順・優先順位・テンプレートは `CURSOR.md` を参照すること。
<!-- END:hourenso-mvp-rules -->
