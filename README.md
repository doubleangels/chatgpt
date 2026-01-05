# ChatGPT Discord Bot

<div align="center">
  <img src="logo.png" alt="Logo" width="250">
</div>
<br>

A feature-rich Discord bot powered by OpenAI's ChatGPT models, designed to provide intelligent conversational capabilities with image analysis support right within your Discord server.

## 🚀 Quick Start

### Prerequisites

- [Bitwarden Secrets Manager](https://bitwarden.com/products/secrets-manager/) - For secure secret management
- [BWS Access Token](https://bitwarden.com/help/article/secrets-cli/) - Access token for Bitwarden Secrets Manager CLI
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
      - BWS_ACCESS_TOKEN=your_bws_access_token_here
```

2. **Deploy the bot:**

```bash
docker-compose up -d
```

## ⚙️ Configuration

### Environment Variables

| Variable            | Description                                                          | Required | Example |
| ------------------- | -------------------------------------------------------------------- | -------- | ------- |
| `BWS_ACCESS_TOKEN`  | Bitwarden Secrets Manager access token for retrieving secrets        | ✅       | -       |

**Note:** Most secrets and API keys are automatically retrieved from Bitwarden Secrets Manager during container startup. You must provide `BWS_ACCESS_TOKEN` for the bot to access these secrets. The following secrets are retrieved from Bitwarden:
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `LOG_LEVEL`
- `MAX_HISTORY_LENGTH`
- `MODEL_NAME`
- `OPENAI_API_KEY`
- `REASONING_EFFORT`
- `RESPONSES_VERBOSITY`

Ensure your Bitwarden Secrets Manager access token is configured for the container to retrieve these secrets.

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

### `/reset`

Reset conversation history for a specific channel or all channels.

- **No channel specified**: Resets conversation history for all channels
- **Channel specified**: Resets conversation history for the selected channel only
