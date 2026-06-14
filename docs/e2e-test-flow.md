# E2E Bot Test Flow — Tenant `daitoan2006`

## Quan trọng: `org` là gì?

```
org = payload.tenantId = tenant._id = MongoDB ObjectId (string)
```

**`org` KHÔNG phải subdomain** (`daitoan2006`). Nó là **MongoDB ObjectId** của tenant.

Khi provision, crm-api truyền `tenantId: tenant.id` (ObjectId) cho crm-bot.
crm-bot lưu chính ObjectId đó vào `CrmTenantWorkspaceMapping.tenantId` (PostgreSQL).

### Cách lấy tenantId thật

```bash
# SSH vào Node A, chạy mongo shell:
mongosh "mongodb+srv://<connection_string>/crm"

# Tìm tenantId theo subdomain (alias)
db.tenants.findOne({ alias: "daitoan2006" }, { _id: 1, alias: 1, name: 1 })
# → { _id: ObjectId("..."), alias: "daitoan2006", name: "..." }

# Copy _id string → dùng làm TENANT_ID bên dưới
```

---

## Chuẩn bị

```bash
TENANT_ID="<ObjectId_from_mongo>"   # VD: "683abcdef1234567890abcde"
SECRET="9935808f00082378f6a0ca785ce59e1bcc7a6584493367b9"
BOT_URL="https://chat.crmsaudi.dev"
API_URL="https://api.crmsaudi.dev"
```

---

## TEST 1: Bot Accept (gọi trực tiếp bot)

Bot phải trả `{accepted: true}` trong <100ms:

```bash
curl -s -X POST "${BOT_URL}/api/bot/typebot/reply" \
  -H "Content-Type: application/json" \
  -d '{
    "org": "'${TENANT_ID}'",
    "conversationId": "test-e2e-001",
    "inboundMessageId": "test-msg-001",
    "text": "Xin chao",
    "channel": "livechat",
    "callbackUrl": "'${API_URL}'/api/v1/bot-callback/reply"
  }'
```

**Expected:**
```json
{ "accepted": true }
```

---

## TEST 2: Callback Endpoint (giả lập bot gọi về API)

### 2a. Wrong secret → 403

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/api/v1/bot-callback/reply" \
  -H "Content-Type: application/json" \
  -H "x-crm-internal-secret: wrong-secret" \
  -d '{
    "org": "'${TENANT_ID}'",
    "conversationId": "test",
    "inboundMessageId": "test",
    "status": "active",
    "handoff": false,
    "messages": []
  }'
```

**Expected:** `403`

### 2b. Correct secret + fake conversation → ignored

```bash
curl -s -X POST "${API_URL}/api/v1/bot-callback/reply" \
  -H "Content-Type: application/json" \
  -H "x-crm-internal-secret: ${SECRET}" \
  -d '{
    "org": "'${TENANT_ID}'",
    "conversationId": "nonexistent-conv-id",
    "inboundMessageId": "test",
    "status": "active",
    "handoff": false,
    "messages": []
  }'
```

**Expected:**
```json
{ "ok": true, "ignored": true }
```

### 2c. Correct secret + real conversation → ok

```bash
# Lấy conversationId thật:
# db.omni_conversations.findOne({ tenantId: ObjectId("TENANT_ID"), "bot.enabled": true }, { _id: 1 })
CONV_ID="<real_conversation_id>"

curl -s -X POST "${API_URL}/api/v1/bot-callback/reply" \
  -H "Content-Type: application/json" \
  -H "x-crm-internal-secret: ${SECRET}" \
  -d '{
    "org": "'${TENANT_ID}'",
    "conversationId": "'${CONV_ID}'",
    "inboundMessageId": "test-cb-001",
    "sessionId": "test-session",
    "status": "active",
    "handoff": false,
    "messages": [
      { "type": "text", "text": "Hello from bot test!" }
    ]
  }'
```

**Expected:**
```json
{ "ok": true }
```

---

## TEST 3: Full E2E (khách nhắn tin thật)

### Qua Livechat

1. Đăng nhập CRM tenant `daitoan2006`
2. Settings → Omni-Channel → Channels → Livechat → Bật Bot (ON)
3. Mở Livechat widget → Gửi "Xin chào"
4. Xem bot trả lời

### Verify (MongoDB)

```javascript
// Bot state trên conversation
db.omni_conversations.findOne(
  { _id: ObjectId("<CONV_ID>") },
  { "bot": 1 }
)
// → bot.enabled: true, bot.sessionId: "cl...", bot.status: "active"

// Bot messages
db.omni_messages.find(
  { conversationId: "<CONV_ID>", source: "bot" }
).sort({ createdAt: -1 })
```

---

## Checklist

| # | Kiểm tra | Expected |
|---|----------|----------|
| 1 | Bot accept | `{accepted: true}` |
| 2 | Wrong secret | `403` |
| 3 | Fake conversation | `{ok: true, ignored: true}` |
| 4 | Real conversation | `{ok: true}` |
| 5 | Bot messages in DB | `source: "bot"` records |

---

## Possible Errors

| Error | Nguyên nhân | Fix |
|-------|-------------|-----|
| `CastError: Cast to ObjectId failed` | Dùng subdomain thay vì ObjectId | Dùng `tenant._id` |
| `403 Invalid internal secret` | Secret không khớp | Sync `CRM_BOT_INTERNAL_SECRET` |
| `500 Missing activeTenantId` | Chưa deploy commit `1fc4d85` | Deploy crm-api |
| `Bot chưa được cấu hình` | Chưa có workspace mapping | Chạy provision |
