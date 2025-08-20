# chatgpt

<div align="center">
  <img src="logo.png" alt="Logo" width="250">
</div>
<br>

A lightweight Discord bot powered by ChatGPT and OpenAI, designed to provide interactive conversational capabilities right within your Discord server.

## Features

- **ChatGPT Integration:** Leverage OpenAI's powerful language model for dynamic, context-aware conversations.
- **Image Analysis:** Analyze and respond to images using vision-capable models like GPT-4o-mini.
- **Rich Formatting:** Get consistently formatted responses with Discord-friendly markdown.
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
      - LOG_LEVEL=info
      - MAX_HISTORY_LENGTH=10
      - MODEL_NAME=gpt-4o-mini
      - OPENAI_API_KEY=your_openai_api_key_here

networks:
  default:
    name: chatgpt
```

## Environment Variables

Here is a table of all available environment variables:

| Variable             | Description                                                | Required |    Default    | Example                                               |
| -------------------- | ---------------------------------------------------------- | :------: | :-----------: | ----------------------------------------------------- |
| `DISCORD_BOT_TOKEN`  | Authentication token for your Discord bot                  |    ✅    |       -       | -                                                     |
| `LOG_LEVEL`          | Determines the verbosity of logs                           |    ❌    |    `info`     | `error`, `warn`, `info`, `debug`                      |
| `MAX_HISTORY_LENGTH` | Maximum number of messages to keep in conversation history |    ❌    |     `10`      | `20`                                                  |
| `MODEL_NAME`         | The name of the OpenAI model to use                        |    ❌    | `gpt-4o-mini` | `gpt-4o-mini`, `gpt-4o`, `gpt-4-vision`, `gpt-5-nano` |
| `OPENAI_API_KEY`     | API key for OpenAI services                                |    ✅    |       -       | -                                                     |

## Image Support

The bot supports image analysis when using vision-capable models like `gpt-4o-mini`, `gpt-4o`, `gpt-4-vision`, or `gpt-5-nano`. Users can:

- Send images as attachments in Discord messages
- Ask questions about the images
- Get descriptions and analysis of visual content
- Combine text and images in the same message

**Note:** Image support requires a vision-capable model. If using a model without vision support, the bot will inform users that image analysis is not available.

## Rich Formatting

The bot provides consistently formatted responses with Discord-friendly markdown formatting.

### Features

- **Consistent Formatting**: All responses use proper Discord markdown
- **Rich Content**: Headers, bold text, italic text, code blocks, and lists
- **Visual Appeal**: Well-structured and easy-to-read responses

### Markdown Formatting

The bot automatically formats responses using:

- **Headers**: `## Section Title`
- **Bold**: `**important text**`
- **Italic**: `*subtle emphasis*`
- **Code**: `` `inline code` ``
- **Code Blocks**: ` `language\ncode` `
- **Lists**: `- bullet points` and `1. numbered lists`
- **Smaller Text**: `-# smaller text`
