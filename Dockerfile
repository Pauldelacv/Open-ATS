# syntax=docker/dockerfile:1

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies, cached as long as the lockfile does not change.
FROM base AS deps
COPY package.json package-lock.json ./
COPY scripts/copy-pdf-worker.mjs ./scripts/
RUN npm ci --no-audit --no-fund

# Build the standalone server.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Minimal runtime image, non-root.
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data
RUN addgroup -S -g 1001 openats \
 && adduser -S -u 1001 -G openats openats \
 && mkdir -p /data/uploads \
 && chown -R openats:openats /data
COPY --from=builder --chown=openats:openats /app/public ./public
COPY --from=builder --chown=openats:openats /app/.next/standalone ./
COPY --from=builder --chown=openats:openats /app/.next/static ./.next/static
COPY --from=builder --chown=openats:openats /app/drizzle ./drizzle
USER openats
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
