# config.js

Centralized configuration and helpers for model capabilities.

## Exports

- `token: string | undefined` – Discord bot token
- `clientId: string | undefined` – application ID
- `openaiApiKey: string | undefined`
- `modelName: string` – defaults to `gpt-4o-mini`
- `maxHistoryLength: number` – defaults to `10`
- `logLevel: string` – defaults to `info`
- `supportsVision(): boolean` – true for `gpt-4o(-mini)`, `gpt-4-vision`, and `gpt-5*`
- `getTemperature(): number` – `1.0` for GPT-5 models, else `0.7`

## Usage

```js
const { modelName, supportsVision, getTemperature } = require('./config');
console.log(modelName, supportsVision(), getTemperature());
```

## Environment variables

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `OPENAI_API_KEY`
- `MODEL_NAME`
- `MAX_HISTORY_LENGTH`
- `LOG_LEVEL`
