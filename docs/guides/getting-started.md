# Getting Started

## Prerequisites

- Discord bot token and application client ID
- OpenAI API key
- Docker (and optionally Docker Compose)

## Deploy with Docker (recommended)

Create a `docker-compose.yml`:

```yaml
version: "3.8"
services:
  chatgpt:
    image: ghcr.io/doubleangels/chatgpt:latest
    container_name: chatgpt-discord-bot
    restart: unless-stopped
    environment:
      - DISCORD_BOT_TOKEN=your_discord_bot_token_here
      - DISCORD_CLIENT_ID=your_discord_client_id_here
      - OPENAI_API_KEY=your_openai_api_key_here
      - MODEL_NAME=gpt-4o-mini
      - MAX_HISTORY_LENGTH=10
      - LOG_LEVEL=info
```

Start the service:

```bash
docker compose up -d
```

That’s it. The container will run the bot and reconnect if it restarts.
