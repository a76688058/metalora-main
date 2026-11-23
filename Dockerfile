# syntax=docker/dockerfile:1.4
# Metalora — standalone Cloud Run image (Express + Vite-built SPA)

# ---------------------------------------------------------------------------
# Builder — production client bundle
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
COPY scripts/clean-dist.mjs ./scripts/clean-dist.mjs
COPY scripts/docker-vite-live-client-key.mjs ./scripts/docker-vite-live-client-key.mjs

RUN --mount=type=secret,id=toss_live_client_key,required=false \
    node scripts/docker-vite-live-client-key.mjs /run/secrets/toss_live_client_key /tmp/vite-live.env \
    && if [ -f /tmp/vite-live.env ]; then set -a && . /tmp/vite-live.env && set +a && rm -f /tmp/vite-live.env; fi \
    && npm run build

# ---------------------------------------------------------------------------
# Runner — Express API + static dist/client
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY server.ts ./
# tsx server.ts loads the runtime graph from src/lib.
# Builder COPY src is compile-only and is not present in this stage.
# Top-level *.ts, plus the server import closure under customComposition.
# Client-only files in that directory are not copied.
COPY src/lib/*.ts ./src/lib/
COPY src/lib/customComposition/productionSnapshot.ts ./src/lib/customComposition/productionSnapshot.ts
COPY src/lib/customComposition/types.ts ./src/lib/customComposition/types.ts
# Extensionless import ../types/reviews from reviewImageRoutes.ts.
# tsx resolves it to this file. It has no further local imports.
COPY src/types/reviews.ts ./src/types/reviews.ts
COPY --from=builder /app/dist/client ./dist/client

EXPOSE 8080

CMD ["./node_modules/.bin/tsx", "server.ts"]
