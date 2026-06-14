# ================= INSTALL BUN ===================
ARG BUN_VERSION=1.3.9

FROM oven/bun:${BUN_VERSION}-slim AS bun

FROM node:24-bullseye-slim AS base

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

RUN apt-get update -qq \
    && apt-get install -qq --no-install-recommends \
    build-essential \
    ca-certificates \
    git \
    g++ \
    openssl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# =============== INSTALL & BUILD =================

FROM base AS builder
ARG SCOPE
COPY . .
RUN SENTRYCLI_SKIP_DOWNLOAD=1 bun install --frozen-lockfile
# Apply nx sync generators (tsconfig project references) before build — nx errors on an
# out-of-sync workspace in non-interactive (CI/Docker) mode instead of auto-applying.
RUN DATABASE_URL=postgresql:// bunx nx sync
RUN SKIP_ENV_CHECK=true DATABASE_URL=postgresql:// NEXT_PUBLIC_VIEWER_URL=http://localhost bunx nx build ${SCOPE}
RUN DATABASE_URL=postgresql:// bunx nx db:generate prisma

# ================== RELEASE ======================

FROM base AS release
ARG SCOPE
ENV SCOPE=${SCOPE}
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/prisma/postgresql ./packages/prisma/postgresql
COPY --from=builder /app/packages/prisma/prisma.config.ts ./packages/prisma/prisma.config.ts
COPY --from=builder --chown=node:node /app/apps/${SCOPE}/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/${SCOPE}/.next/static ./apps/${SCOPE}/.next/static
COPY --from=builder --chown=node:node /app/apps/${SCOPE}/public ./apps/${SCOPE}/public


COPY scripts/${SCOPE}-entrypoint.sh ./
# Strip CRLF (scripts may be checked out / copied from Windows) so the shebang resolves, then make executable.
RUN sed -i 's/\r$//' ./${SCOPE}-entrypoint.sh && chmod +x ./${SCOPE}-entrypoint.sh
USER node
ENTRYPOINT ./${SCOPE}-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
