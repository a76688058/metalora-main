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

RUN npm run build

# ---------------------------------------------------------------------------
# Runner — Express API + static dist/client
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY server.ts ./
COPY --from=builder /app/dist/client ./dist/client

EXPOSE 8080

CMD ["./node_modules/.bin/tsx", "server.ts"]
