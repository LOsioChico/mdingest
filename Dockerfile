# Stage 1: Build Astro frontend
FROM oven/bun:1.3 AS frontend
WORKDIR /web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY shared/ /shared/
COPY web/ ./
RUN bun run build

# Stage 2: Production NestJS + static files
FROM oven/bun:1.3 AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY tsconfig.json ./
COPY shared/ ./shared/
COPY src/ ./src/

# Copy Astro build output from frontend stage
COPY --from=frontend /web/dist ./web/dist

# Expose port (Cloudflare Container expects the app to listen on 0.0.0.0)
ENV PORT=3000
EXPOSE 3000

# Start the NestJS app
CMD ["bun", "run", "src/main.ts"]
