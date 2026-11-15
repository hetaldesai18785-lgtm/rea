FROM node:22-bookworm-slim AS builder
WORKDIR /app/platform

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

COPY platform/package*.json ./
RUN npm ci

COPY platform/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app/platform

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4100
ENV AETHERFORGE_DATA_DIR=/app/platform/data

COPY --from=builder /app/platform/package*.json ./
COPY --from=builder /app/platform/node_modules ./node_modules
COPY --from=builder /app/platform/dist ./dist
COPY --from=builder /app/platform/shared ./shared

RUN mkdir -p /app/platform/data/workspaces /app/platform/data/snapshots /app/platform/data/deployments

EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://127.0.0.1:4100/api/health || exit 1

CMD ["node", "dist/server/index.js"]
