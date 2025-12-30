FROM node:24-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache dumb-init su-exec

# Create user and group
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discordbot -u 1001

# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies with BuildKit cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --prefer-offline && \
    npm cache clean --force

# Copy application files
COPY --chown=discordbot:nodejs . .

# Ensure WORKDIR ownership is correct
RUN chown -R discordbot:nodejs /app

# Use dumb-init for proper signal handling and run as non-root user
ENTRYPOINT ["dumb-init", "--"]
CMD ["su-exec", "discordbot", "node", "index.js"]
