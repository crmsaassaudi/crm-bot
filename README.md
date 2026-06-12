# crm-bot — Visual Automation Builder (Typebot Fork)

> **Base:** Typebot (Fair Source) · **Stack:** Next.js · TypeScript · Prisma · Bun

---

## Overview

`crm-bot` is a customized fork of [Typebot](https://typebot.io) — a visual chatbot/automation builder. It provides:

- **Visual flow builder** — drag-and-drop chatbot and automation workflow designer
- **Chatbot viewer** — embeddable runtime that executes bot flows
- **CRM integration** — connected to `crm-api` for data lookup and contact/ticket creation
- **Omni-channel bot** — bots can be deployed on Facebook Messenger, WhatsApp, website widget

## Apps in the Monorepo

| App | Description |
|---|---|
| `apps/builder` | Next.js visual flow builder UI |
| `apps/viewer` | Next.js chatbot viewer/runtime |
| `apps/docs` | Documentation site |
| `apps/landing-page` | Marketing landing page |
| `apps/workflows` | Workflow engine (background processing) |

## Key Features (Inherited from Typebot)

- 34+ building blocks (text, input, logic, integrations)
- Conditional branching, scripting (JavaScript), A/B testing
- OpenAI integration for AI-powered responses
- Webhook / HTTP request blocks for CRM API integration
- Custom themes with CSS override support
- Analytics: completion rates, drop-off rates
- CSV export of results

## CRM Integration Points

The bot connects to `crm-api` to:
- Look up contacts by phone/email
- Create or update contacts from bot conversations
- Create tickets from conversations
- Trigger automation rules

## Local Development

Follow the [Typebot local installation guide](https://docs.typebot.io/contribute/guides/local-installation):

```bash
cd crm-bot
bun install

# Start all apps
bun dev
```

Or start individual apps:
```bash
cd apps/builder && bun dev   # http://localhost:3000
cd apps/viewer  && bun dev   # http://localhost:3001
```

## Environment Variables

Copy the example files and fill in:
```bash
cp apps/builder/.env.dev.example apps/builder/.env.dev
cp apps/viewer/.env.dev.example  apps/viewer/.env.dev
```

Key variables:
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `NEXTAUTH_SECRET` | Auth secret |
| `NEXTAUTH_URL` | Builder base URL |
| `VIEWER_URL` | Viewer/embed base URL |
| `ENCRYPTION_SECRET` | Secret for encrypting credentials |
| `CRM_API_URL` | `crm-api` base URL for integration |

## Docker

```bash
docker-compose -f docker-compose.dev.yml up -d
```

## License

Typebot is licensed under [Functional Source License (FSL)](https://docs.typebot.io/self-hosting#license-requirements). Self-hosting is allowed for internal use; commercial redistribution requires a commercial license.
