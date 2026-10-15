# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build without production secrets or a connection to the production database.
RUN NODE_ENV=production \
    PAYLOAD_SECRET=disposable-build-secret-never-used-at-runtime \
    DATABASE_URL=file:/tmp/trace-build.db \
    SERVER_URL=http://localhost:3000 \
    npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Keep the CLI and TS dependencies: migrations run from the same image as the app.
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json /app/tsconfig.json /app/next.config.mjs /app/next-env.d.ts ./
RUN mkdir -p storage/database storage/media && chown -R node:node storage
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
