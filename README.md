# ChatGPT Discord Bot

<div align="center">
  <img src="logo.png" alt="Logo" width="250">
</div>
<br>

A feature-rich Discord bot powered by OpenAI's ChatGPT models, designed to provide intelligent conversational capabilities with image analysis support right within your Discord server.

## ✨ Features

- **🤖 AI-Powered Conversations**: Leverage OpenAI's latest language models (GPT-4o-mini, GPT-4o, GPT-5-nano, etc.) for dynamic, context-aware conversations
- **🖼️ Image Analysis**: Analyze and respond to images using vision-capable models with detailed descriptions and insights
- **💬 Multi-Channel Support**: Maintain separate conversation histories for each user in each channel
- **📝 Rich Formatting**: Beautiful Discord markdown formatting with headers, code blocks, lists, and emphasis
- **🔧 Slash Commands**: Built-in commands for managing conversation history
- **📊 Comprehensive Logging**: Detailed logging with Winston for monitoring and debugging
- **🐳 Docker Ready**: Containerized deployment with proper signal handling and security
- **⚡ Auto-Restart**: Automatic restart on failures with proper error handling
- **🔒 Secure**: Non-root container execution with proper user permissions

## 🚀 Quick Start

### Prerequisites

- [Discord Bot Token](https://discord.com/developers/applications) - Create a new application and bot
- [OpenAI API Key](https://platform.openai.com/overview) - Get your API key from OpenAI
- Docker and Docker Compose (for containerized deployment)

### Docker Deployment (Recommended)

1. **Create a `docker-compose.yml` file:**

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
    networks:
      - chatgpt-network

networks:
  chatgpt-network:
    driver: bridge
```

2. **Deploy the bot:**

```bash
docker-compose up -d
```

### Manual Setup

1. **Clone the repository:**

```bash
git clone https://github.com/doubleangels/chatgpt.git
cd chatgpt
```

2. **Install dependencies:**

```bash
npm install
```

3. **Create a `.env` file:**

```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
OPENAI_API_KEY=your_openai_api_key_here
MODEL_NAME=gpt-4o-mini
MAX_HISTORY_LENGTH=10
LOG_LEVEL=info
```

4. **Deploy slash commands:**

```bash
npm run deploy
```

5. **Start the bot:**

```bash
npm start
```

## ⚙️ Configuration

### Environment Variables

| Variable             | Description                         | Required | Default       | Example                  |
| -------------------- | ----------------------------------- | -------- | ------------- | ------------------------ |
| `DISCORD_BOT_TOKEN`  | Discord bot authentication token    | ✅       | -             | -                        |
| `DISCORD_CLIENT_ID`  | Discord application client ID       | ✅       | -             | -                        |
| `OPENAI_API_KEY`     | OpenAI API key for AI services      | ✅       | -             | -                        |
| `MODEL_NAME`         | OpenAI model to use                 | ❌       | `gpt-4o-mini` | `gpt-4o`, `gpt-5-nano`   |
| `MAX_HISTORY_LENGTH` | Max conversation messages to retain | ❌       | `10`          | `20`                     |
| `LOG_LEVEL`          | Logging verbosity                   | ❌       | `info`        | `debug`, `warn`, `error` |

### Supported Models

- **Vision Models**: `gpt-4o-mini`, `gpt-4o`, `gpt-4-vision`, `gpt-5-nano`
- **Text-Only Models**: `gpt-3.5-turbo`, `gpt-4-turbo`, `gpt-4`

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

### Rich Formatting

The bot automatically formats responses using Discord markdown:

- **Headers**: `## Section Title`
- **Bold**: `**important text**`
- **Italic**: `*subtle emphasis*`
- **Code**: `` `inline code` ``
- **Code Blocks**: ` ```language\ncode``` `
- **Lists**: `- bullet points` and `1. numbered lists`
- **Smaller Text**: `-# smaller text`

## 🔧 Commands

### `/reset` (Admin Only)

Reset conversation history for a specific channel or all channels. Requires Administrator permissions.

- **No channel specified**: Resets conversation history for all channels
- **Channel specified**: Resets conversation history for the selected channel only

## 📁 Project Structure

```
chatgpt/
├── commands/           # Slash command handlers
│   └── reset.js       # Reset conversation history (admin)
├── events/            # Discord event handlers
│   ├── messageCreate.js # Message processing
│   └── ready.js       # Bot ready event
├── utils/             # Utility modules
│   ├── aiService.js   # OpenAI API integration
│   └── messageUtils.js # Message formatting utilities
├── config.js          # Configuration management
├── deploy-commands.js # Command deployment script
├── index.js           # Main application entry point
├── logger.js          # Logging configuration
├── Dockerfile         # Container configuration
└── package.json       # Dependencies and scripts
```

## 🔍 Logging

The bot uses Winston for comprehensive logging with configurable levels:

- **DEBUG**: Detailed debugging information
- **INFO**: General operational information
- **WARN**: Warning messages
- **ERROR**: Error conditions and exceptions

Logs include timestamps, module labels, and structured metadata for easy monitoring and debugging.

## 🐳 Docker Features

- **Multi-stage build** for optimized image size
- **Non-root execution** for enhanced security
- **Signal handling** with dumb-init for graceful shutdowns
- **Layer caching** for faster builds
- **Production-ready** configuration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/doubleangels/chatgpt/issues)
- **Discussions**: [GitHub Discussions](https://github.com/doubleangels/chatgpt/discussions)

## 🔗 Links

- **Repository**: [https://github.com/doubleangels/chatgpt](https://github.com/doubleangels/chatgpt)
- **Docker Hub**: [ghcr.io/doubleangels/chatgpt](https://ghcr.io/doubleangels/chatgpt)
- **Discord Developer Portal**: [https://discord.com/developers/applications](https://discord.com/developers/applications)
- **OpenAI Platform**: [https://platform.openai.com/overview](https://platform.openai.com/overview)
