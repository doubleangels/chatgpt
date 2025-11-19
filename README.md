# ChatGPT Discord Bot

<div align="center">
  <img src="logo.png" alt="Logo" width="250">
</div>
<br>

A feature-rich Discord bot powered by OpenAI's ChatGPT models, designed to provide intelligent conversational capabilities with image analysis support right within your Discord server.

## 🚀 Quick Start

### Prerequisites

- [Discord Bot Token](https://discord.com/developers/applications) - Create a new application and bot
- [OpenAI API Key](https://platform.openai.com/overview) - Get your API key from OpenAI
- Docker and Docker Compose

### Docker Deployment

1. **Create a `docker-compose.yml` file:**

```yaml
services:
  chatgpt:
    image: ghcr.io/doubleangels/chatgpt:latest
    container_name: chatgpt-discord-bot
    restart: unless-stopped
    environment:
      - DISCORD_BOT_TOKEN=your_discord_bot_token_here
      - DISCORD_CLIENT_ID=your_discord_client_id_here
      - OPENAI_API_KEY=your_openai_api_key_here
      - MODEL_NAME=gpt-5-nano
      - MAX_HISTORY_LENGTH=10
      - REASONING_EFFORT=medium
      - RESPONSES_VERBOSITY=medium
      - LOG_LEVEL=info
```

2. **Deploy the bot:**

```bash
docker-compose up -d
```

## ⚙️ Configuration

### Environment Variables

| Variable              | Description                                                               | Required | Default      | Example                  |
| --------------------- | ------------------------------------------------------------------------- | -------- | ------------ | ------------------------ |
| `DISCORD_BOT_TOKEN`   | Discord bot authentication token                                          | ✅       | -            | -                        |
| `DISCORD_CLIENT_ID`   | Discord application client ID                                             | ✅       | -            | -                        |
| `OPENAI_API_KEY`      | OpenAI API key for AI services                                            | ✅       | -            | -                        |
| `MODEL_NAME`          | OpenAI model to use                                                       | ❌       | `gpt-5-nano` | `gpt-5`, `gpt-5-mini`    |
| `MAX_HISTORY_LENGTH`  | Max conversation messages to retain                                       | ❌       | `10`         | `20`                     |
| `REASONING_EFFORT`    | Additional reasoning depth (`low`, `medium`, `high`) for supported models | ❌       | `medium`     | `medium`                 |
| `RESPONSES_VERBOSITY` | Verbosity hint for supported models (`low`, `medium`, `high`)             | ❌       | `medium`     | `medium`                 |
| `LOG_LEVEL`           | Logging verbosity                                                         | ❌       | `info`       | `debug`, `warn`, `error` |

### Supported Models

- `gpt-5`
- `gpt-5-nano`
- `gpt-5-mini`

## 🖼️ Image Analysis

The bot supports comprehensive image analysis when using vision-capable models:

- **Image Descriptions**: Get detailed descriptions of image content
- **Visual Q&A**: Ask questions about images and receive contextual answers
- **Multi-Modal Input**: Combine text and images in the same message
- **Automatic Detection**: Automatically processes image attachments

**Usage Examples:**

- Send an image with text: "What's in this image?"
- Ask follow-up questions about previously shared images
- Get analysis of charts, diagrams, or screenshots

## 💬 Conversation Features

### Multi-Channel Support

- Shared conversation history per channel, allowing multiple users to participate
- Context preservation across message exchanges from all users
- Automatic history management and cleanup

### Interaction Methods

- **Mentions**: `@ChatGPT What's the weather like?`
- **Replies**: Reply to any bot message to continue the conversation

## 🔧 Commands

### `/reset` (Admin Only)

Reset conversation history for a specific channel or all channels. Requires Administrator permissions.

- **No channel specified**: Resets conversation history for all channels
- **Channel specified**: Resets conversation history for the selected channel only
