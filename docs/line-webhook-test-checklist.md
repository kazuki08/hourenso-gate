# LINE Webhook テスト手順（署名付き）と設定チェックリスト

このドキュメントは、`/api/webhook/line` の疎通確認をローカル/本番で行うための手順です。

---

## 1) 前提

- Webhookエンドポイント:
  - ローカル例: `http://localhost:3001/api/webhook/line?clerkUserId=YOUR_CLERK_USER_ID`
  - 本番例: `https://YOUR_DOMAIN/api/webhook/line?clerkUserId=YOUR_CLERK_USER_ID`
- `.env.local` または本番環境に `LINE_CHANNEL_SECRET` が設定済み
- サーバーが起動済み

---

## 2) 署名付き curl テスト（zsh / macOS）

### 2-1. 変数を設定

```bash
export WEBHOOK_URL='http://localhost:3001/api/webhook/line?clerkUserId=YOUR_CLERK_USER_ID'
export LINE_CHANNEL_SECRET='YOUR_LINE_CHANNEL_SECRET'
```

### 2-2. `follow` イベント（紐付けテスト）

```bash
payload='{"events":[{"type":"follow","replyToken":"dummy-reply-token","source":{"type":"user","userId":"U1234567890abcdef"}}]}'
sig=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$LINE_CHANNEL_SECRET" -binary | openssl base64)
curl -i -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-line-signature: $sig" \
  -d "$payload"
```

期待:
- `200` で `linked` が増える

### 2-3. `message: 日報作成`（ドラフト生成）

```bash
payload='{"events":[{"type":"message","replyToken":"dummy-reply-token","source":{"type":"user","userId":"U1234567890abcdef"},"message":{"type":"text","text":"日報作成"}}]}'
sig=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$LINE_CHANNEL_SECRET" -binary | openssl base64)
curl -i -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-line-signature: $sig" \
  -d "$payload"
```

期待:
- `200`
- `draftsGenerated` が増える

### 2-4. `message: 確定版`（確定版転送）

```bash
payload='{"events":[{"type":"message","replyToken":"dummy-reply-token","source":{"type":"user","userId":"U1234567890abcdef"},"message":{"type":"text","text":"本日の確定版です。対応完了しました。"}}]}'
sig=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$LINE_CHANNEL_SECRET" -binary | openssl base64)
curl -i -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-line-signature: $sig" \
  -d "$payload"
```

期待:
- `200`
- `finalsForwarded` が増える（`LINE_FINAL_TARGET_ID` または `LINE_USER_ID` が設定済みの場合）

---

## 3) 署名不正テスト（401確認）

```bash
payload='{"events":[{"type":"follow","source":{"type":"user","userId":"U_invalid"}}]}'
curl -i -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-line-signature: invalid-signature" \
  -d "$payload"
```

期待:
- `401`
- `error: "invalid_signature"`

---

## 4) Pythonで署名生成する場合（任意）

```bash
python3 - <<'PY'
import base64, hashlib, hmac, json, os
secret = os.environ["LINE_CHANNEL_SECRET"].encode()
payload = {
    "events": [
        {
            "type": "message",
            "replyToken": "dummy-reply-token",
            "source": {"type": "user", "userId": "U1234567890abcdef"},
            "message": {"type": "text", "text": "日報作成"}
        }
    ]
}
raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
sig = base64.b64encode(hmac.new(secret, raw, hashlib.sha256).digest()).decode()
print("payload:", raw.decode())
print("signature:", sig)
PY
```

出力された `payload` と `signature` を `curl` にそのまま渡してください。

---

## 5) LINE Developers 設定チェックリスト

### チャネル基本設定

- [ ] Messaging APIチャネルを使用している
- [ ] `Channel secret` をアプリ側 `LINE_CHANNEL_SECRET` に設定済み
- [ ] `Channel access token` を `LINE_CHANNEL_ACCESS_TOKEN` に設定済み

### Webhook設定

- [ ] Webhook URL が正しい（`/api/webhook/line` まで含む）
- [ ] 必要なら `clerkUserId` クエリ付きURLを設定している
- [ ] 「Webhookの利用」= ON
- [ ] 「Verify」で成功する
- [ ] 応答が遅い/失敗時に再送される前提で、処理が冪等に近い

### イベント/動作要件

- [ ] `follow` イベントが有効（友だち追加時）
- [ ] `join` イベントが有効（グループ招待時）
- [ ] `message` イベントが有効（テキスト受信時）
- [ ] Botのグループ参加許可がON（グループ送信を使う場合）

### 本番運用チェック

- [ ] 本番URLはHTTPS
- [ ] サーバー時刻が大きくずれていない
- [ ] 失敗ログを追える（`missing_env_vars`, `invalid_signature`, `line_send_failed` など）
- [ ] `LINE_FINAL_TARGET_ID` または `LINE_USER_ID` が設定済み（確定版転送先）

---

## 6) よくある失敗

- `401 invalid_signature`
  - 署名生成時のpayload文字列と送信payload文字列が一致していない
  - `LINE_CHANNEL_SECRET` が誤っている

- `line_target_not_linked` / 転送されない
  - `LINE_FINAL_TARGET_ID` または `LINE_USER_ID` が未設定
  - グループ/個人の紐付け種別が一致していない

- `missing_env_vars`
  - `.env.local` と本番環境の設定差分（Vercel側未設定）
