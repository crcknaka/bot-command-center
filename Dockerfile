FROM node:24-alpine AS builder

WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build frontend
RUN npx vite build

# Build backend
RUN npx tsc

# ─── Production ──────────────────────────────────────────────────────────────

FROM node:24-alpine

WORKDIR /app

# Install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Data directory for SQLite
RUN mkdir -p /app/data
VOLUME /app/data

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
