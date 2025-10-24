FROM node:24-alpine AS base

WORKDIR /app

RUN apk add --no-cache dumb-init

RUN npm install -g npm@latest

RUN node --version && npm --version

RUN addgroup -g 1001 -S nodejs && \
    adduser -S discordbot -u 1001

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=discordbot:nodejs . .

USER discordbot

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "index.js"]
