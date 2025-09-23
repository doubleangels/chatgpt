# Configuration Guide

Configure the bot via environment variables in `.env` or your runtime environment.

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| DISCORD_BOT_TOKEN | Discord bot token | Yes | - |
| DISCORD_CLIENT_ID | Discord application client ID | Yes | - |
| OPENAI_API_KEY | OpenAI API key | Yes | - |
| MODEL_NAME | Model to use | No | gpt-4o-mini |
| MAX_HISTORY_LENGTH | Messages kept in history | No | 10 |
| LOG_LEVEL | Logging verbosity | No | info |

Tips:
- Use `MODEL_NAME` that supports images if you want vision features.
- Increase `MAX_HISTORY_LENGTH` for longer context per channel.
