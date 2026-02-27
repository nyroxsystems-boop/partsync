# ────────────────────────────────────────────────
# PartSync Server — Multi-stage Docker Build
# ────────────────────────────────────────────────

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root config
COPY package.json tsconfig.base.json ./

# Copy package files
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/

# Install all dependencies
RUN npm install --legacy-peer-deps

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

# Build shared first, then server
RUN cd packages/shared && npx tsc
RUN cd packages/server && npx tsc

# Copy dashboard assets to dist
RUN cp -r packages/server/src/dashboard packages/server/dist/

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Copy root config
COPY package.json ./

# Copy built shared
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/

# Copy built server
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/server/dist packages/server/dist/

# Install production deps only
RUN npm install --omit=dev --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Start server
CMD ["node", "packages/server/dist/index.js"]
