FROM oven/bun:1.3 AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Expose port (Cloudflare Container expects the app to listen on 0.0.0.0)
ENV PORT=3000
EXPOSE 3000

# Start the NestJS app
CMD ["bun", "run", "src/main.ts"]
