# Dockerfile for ChatGPT Bot
# Multi-stage build for optimized image size and security

# Use specific Node.js version for reproducibility
FROM node:24.1.0-alpine AS base

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache dumb-init su-exec

# Create user and group in a single layer
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discordbot -u 1001 -G nodejs

# Copy package files
COPY package*.json ./

# Install dependencies and clean cache
RUN npm ci --omit=dev && npm cache clean --force

# Copy application files with proper ownership
COPY --chown=discordbot:nodejs . .

# Switch to non-root user
USER discordbot

# Use dumb-init as PID 1 and su-exec for privilege dropping
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "index.js"]
