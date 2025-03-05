# chatgpt

![Logo](logo.png)

A lightweight Discord bot powered by ChatGPT and OpenAI, designed to provide interactive conversational capabilities right within your Discord server.

## Features

- **ChatGPT Integration:** Leverage OpenAI's powerful language model for dynamic, context-aware conversations.
- **Easy Deployment:** Containerized with Docker, ensuring quick and hassle-free setup.
- **Scalable & Resilient:** Automatically restarts on failures to maintain high availability.

## Prerequisites

Before deploying the bot, ensure you have the following:

- A valid [Discord Bot Token](https://discord.com/developers/applications).
- An active [OpenAI API key](https://platform.openai.com/overview).

## Docker Compose Setup

Use the following `docker-compose.yml` snippet to deploy the bot:

```yaml
services:
  chatgpt:
    image: ghcr.io/doubleangels/chatgpt:latest
    container_name: chatgpt
    restart: always
    environment:
      - DISCORD_BOT_TOKEN=your_discord_bot_token_here
      - OPENAI_API_KEY=your_openai_api_key_here
      - MODEL_NAME=your_desired_model_name_here
      - MAX_HISTORY_LENGTH=your_desired_max_history_length_here
      - LOG_LEVEL=your_desired_log_level_here

networks:
  default:
    name: chatgpt
```
