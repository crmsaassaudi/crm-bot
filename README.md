# crm-bot — Visual Automation Builder (Typebot Fork)

> **Last updated:** 2026-06-14
>
> **Base:** Typebot v3.16.1 (Fair Source) · **Stack:** Next.js · TypeScript · Prisma · Bun

---

## Bài toán (Problem Statement)

`crm-bot` là service chatbot **multi-tenant** tích hợp vào nền tảng CRM. Luồng xử lý:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Message Flow Architecture                          │
│                                                                           │
│  Customer                                                                 │
│  (FB/IG/WA/Email)                                                         │
│       │                                                                   │
│       ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      crm-api (Orchestrator)                         │  │
│  │                                                                      │  │
│  │  1. Webhook nhận message từ Meta/WhatsApp/Email                      │  │
│  │  2. Lưu message vào MongoDB (conversation + message)                 │  │
│  │  3. Kiểm tra conversation có bot.enabled = true?                     │  │
│  │     → YES: Dispatch sang crm-bot via BullMQ queue                    │  │
│  │     → NO:  Route bình thường cho agent                               │  │
│  │  4. Nhận response từ crm-bot                                         │  │
│  │  5. Gửi reply ngược về khách qua OutboundService                     │  │
│  │  6. Nếu handoff → chuyển sang agent                                  │  │
│  └──────────┬────────────────────────────────────────────────┬──────────┘  │
│             │  HTTP POST /api/bot/typebot/reply               │            │
│             ▼                                                 │            │
│  ┌──────────────────────────────────────────────┐             │            │
│  │           crm-bot (Typebot Viewer)            │             │            │
│  │                                                │             │            │
│  │  1. Nhận request (org, flowId, text, ...)      │             │            │
│  │  2. Resolve flow theo publicId                 │             │            │
│  │  3. Gọi Typebot engine (start/continue chat)   │             │            │
│  │  4. Normalize response → messages + status     │             │            │
│  │  5. Trả về crm-api                             │             │            │
│  │                                                │             │            │
│  │  ⚠️ crm-bot KHÔNG gửi reply trực tiếp          │             │            │
│  │     crm-api là người chịu trách nhiệm          │             │            │
│  │     điều phối toàn bộ                           │             │            │
│  └─────────────────────────────────────────────────┘             │            │
│                                                                  │            │
│                        crm-api gửi reply ◄───────────────────────┘            │
│                           ▼                                                   │
│                    Customer nhận reply                                         │
└────────────────────────────────────────────────────────────────────────────┘
```

### Nguyên tắc thiết kế

| Nguyên tắc                    | Mô tả                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **crm-api là orchestrator**   | crm-api nhận message, quyết định dispatch sang bot, nhận kết quả, và gửi reply. Bot KHÔNG gửi reply trực tiếp         |
| **Bot là worker thuần**       | crm-bot chỉ nhận request, chạy flow engine, trả về kết quả. Không truy cập MongoDB CRM, không gọi Meta API            |
| **Multi-tenant**              | Mỗi CRM tenant có 1 Typebot workspace riêng. Isolation qua `CrmTenantWorkspaceMapping` (tenantId → workspaceId)       |
| **Giao tiếp HTTP hoặc Queue** | crm-api → crm-bot qua HTTP (`POST /api/bot/typebot/reply`). Có thể mở rộng sang queue nếu cần                         |
| **Idempotent**                | Mỗi inbound message chỉ được xử lý 1 lần (Redis idempotency key)                                                      |
| **Handoff**                   | Khi flow Typebot emit signal `handoff_to_agent`, bot trả `status: "handoff"` → crm-api chuyển conversation sang agent |

### Multi-Tenant Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Tenant Provisioning                        │
│                                                              │
│  crm-api (onboarding)                                        │
│       │                                                      │
│       │ POST /api/internal/workspaces/provision               │
│       │ Headers: x-crm-internal-secret                        │
│       ▼                                                      │
│  crm-bot (builder)                                           │
│       │                                                      │
│       ├── Create User (from ownerEmail)                       │
│       ├── Create Workspace (Typebot workspace)                │
│       └── Create CrmTenantWorkspaceMapping                    │
│            { tenantId, workspaceId, ownerEmail }              │
│                                                              │
│  SSO Login (Keycloak)                                        │
│       │                                                      │
│       ├── Extract tenantId from JWT claims                    │
│       ├── Resolve workspace via CrmTenantWorkspaceMapping     │
│       ├── Enforce owner-only access (SSO lockdown)            │
│       └── Auto-manage workspace membership                   │
└──────────────────────────────────────────────────────────────┘
```

### Bot State Machine (per Conversation)

```
                    ┌──────────┐
  conversation.bot  │  active  │ ◄── Bot đang xử lý flow
  .status           └────┬─────┘
                         │
            ┌────────────┼────────────┐
            ▼                         ▼
       ┌─────────┐              ┌──────────┐
       │ handoff  │              │  ended   │
       └─────────┘              └──────────┘
    Agent tiếp quản          Flow hoàn tất
```

---

## Apps in the Monorepo

| App                 | Port | Description                                                                  |
| ------------------- | ---- | ---------------------------------------------------------------------------- |
| `apps/builder`      | 4202 | Next.js visual flow builder UI (tenant owner truy cập qua SSO)               |
| `apps/viewer`       | 4203 | Next.js chatbot viewer/runtime — expose `/api/bot/typebot/reply` cho crm-api |
| `apps/workflows`    | 3002 | Workflow engine (export results, onboarding emails)                          |
| `apps/docs`         | —    | Documentation site                                                           |
| `apps/landing-page` | —    | Marketing landing page (không dùng)                                          |

## Key Features (Inherited from Typebot)

- 34+ building blocks (text, input, logic, integrations)
- Conditional branching, scripting (JavaScript), A/B testing
- OpenAI integration for AI-powered responses
- Webhook / HTTP request blocks for CRM API integration
- Custom themes with CSS override support
- Analytics: completion rates, drop-off rates
- CSV export of results

## CRM Integration Points

### Existing (Done)

| Component              | Location                                                     | Description                                              |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| **Provision API**      | `builder/src/app/api/internal/workspaces/provision/route.ts` | Internal endpoint for crm-api to create tenant workspace |
| **CRM Tenant Mapping** | `packages/workspaces/src/crmTenantWorkspaceMapping.ts`       | CRUD + guards cho tenantId ↔ workspaceId mapping         |
| **SSO Keycloak**       | `packages/auth/src/lib/nextAuth.ts` + `providers.ts`         | Keycloak login with tenant assertion                     |
| **Bot Reply Endpoint** | `viewer/src/app/api/bot/typebot/reply/route.ts`              | HTTP endpoint nhận request từ crm-api                    |
| **Bot Service**        | `viewer/src/server/crm-bot/botService.ts`                    | Orchestrate idempotency + Typebot engine                 |
| **Typebot Adapter**    | `viewer/src/server/crm-bot/typebotAdapter.ts`                | Gọi `handleStartChat` / `handleContinueChat`             |
| **Idempotency Store**  | `viewer/src/server/crm-bot/idempotencyStore.ts`              | Redis-backed dedup cho bot reply                         |
| **Prisma Schema**      | `packages/prisma/postgresql/schema.prisma`                   | `CrmTenantWorkspaceMapping` model                        |

### On crm-api Side

| Component                    | Location                                                                 | Description                                                 |
| ---------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Bot Queue Service**        | `crm-api/src/omni-inbound/bot/bot-queue.service.ts`                      | Enqueue inbound message vào BullMQ `bot-processing` queue   |
| **Bot Processing Processor** | `crm-api/src/omni-inbound/bot/bot-processing.processor.ts`               | BullMQ worker: resolve conversation → call bot → send reply |
| **Bot API Service**          | `crm-api/src/omni-inbound/bot/bot-api.service.ts`                        | HTTP client gọi `POST /api/bot/typebot/reply` trên viewer   |
| **Bot Conversation Lock**    | `crm-api/src/omni-inbound/bot/bot-conversation-lock.service.ts`          | Redis distributed lock prevent concurrent bot processing    |
| **Workspace Provisioning**   | `crm-api/src/tenants/services/crm-bot-workspace-provisioning.service.ts` | Gọi builder provision API khi onboarding tenant             |

## Local Development

```bash
cd crm-bot

# 1. Start infrastructure (PostgreSQL, MinIO, Grafana)
docker-compose -f docker-compose.dev.yml up -d

# 2. Install dependencies
bun install

# 3. Start all apps (builder + viewer + workflows)
bun dev
```

Or start individual apps:
```bash
# Builder: http://localhost:4202
cd apps/builder && bun dev

# Viewer: http://localhost:4203
cd apps/viewer && bun dev
```

## Environment Variables

Copy the example files and fill in:
```bash
cp .env.dev.example .env.dev
```

| Variable                  | Required | Description                                      |
| ------------------------- | -------- | ------------------------------------------------ |
| `DATABASE_URL`            | ✅        | PostgreSQL connection string (Prisma)            |
| `REDIS_URL`               | ✅        | Redis for idempotency + sessions                 |
| `ENCRYPTION_SECRET`       | ✅        | Secret for encrypting credentials                |
| `CRM_BOT_SSO_LOCKDOWN`    | ✅        | `true` to enforce Keycloak-only login            |
| `NEXT_PUBLIC_CRM_BOT_SSO_LOCKDOWN`  | ✅        | Client mirror of `CRM_BOT_SSO_LOCKDOWN` — must match it |
| `CRM_BOT_INTERNAL_SECRET` | ✅        | Shared secret for crm-api ↔ crm-bot internal API |
| `KEYCLOAK_CLIENT_ID`      | ✅        | Keycloak client ID for SSO                       |
| `KEYCLOAK_CLIENT_SECRET`  | ✅        | Keycloak client secret                           |
| `KEYCLOAK_ISSUER`         | ✅        | Keycloak issuer URL                              |
| `NEXTAUTH_URL`            | ✅        | Builder base URL                                 |
| `NEXT_PUBLIC_VIEWER_URL`  | ✅        | Viewer/embed base URL                            |

## Docker

```bash
# Development
docker-compose -f docker-compose.dev.yml up -d

# Production build
docker-compose -f docker-compose.build.yml build
```

## License

Typebot is licensed under [Functional Source License (FSL)](https://docs.typebot.io/self-hosting#license-requirements). Self-hosting is allowed for internal use; commercial redistribution requires a commercial license.
