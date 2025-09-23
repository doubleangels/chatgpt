---
title: Configuration
---

# Configuration

Set environment variables via `.env`, Docker, or your host environment.

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| `DISCORD_BOT_TOKEN` | Discord bot token | Yes | - |
| `DISCORD_CLIENT_ID` | Discord application client ID | Yes | - |
| `OPENAI_API_KEY` | OpenAI API key | Yes | - |
| `MODEL_NAME` | OpenAI model to use | No | `gpt-4o-mini` |
| `MAX_HISTORY_LENGTH` | Messages to retain in history | No | `10` |
| `LOG_LEVEL` | Logging verbosity | No | `info` |

See the README for supported models and details.

