# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/lin_blog
COPY lin_blog/package.json lin_blog/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY lin_blog/ ./
RUN npm run build


FROM node:22-bookworm-slim AS server-deps

WORKDIR /app/serve
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY serve/package.json ./
# Backend packages are locked with pnpm in the repository. npm is used here to
# avoid shipping the pnpm store in the runtime image while still allowing native
# modules such as bcrypt and sharp to build when a prebuilt binary is unavailable.
# bcrypt ships a prebuilt binary but still needs its install script to run,
# otherwise require('bcrypt') fails inside the container.
RUN npm install --omit=dev --no-audit --no-fund \
    && npm install-scripts approve bcrypt \
    && npm rebuild bcrypt --foreground-scripts


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV LINBLOG_PORT=3030

WORKDIR /app

COPY --from=server-deps /app/serve/node_modules ./serve/node_modules
COPY serve ./serve
COPY --from=frontend-build /app/lin_blog/dist ./lin_blog/dist

RUN mkdir -p /app/serve/data/files /app/serve/storage/file-backups /app/serve/storage/db-backups

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || process.env.LINBLOG_PORT || 3030) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "serve/linlog.js"]
