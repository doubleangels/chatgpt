# config.js

Centralized configuration and helpers for model capabilities.

## Exports

- `token` (string | undefined)
- `clientId` (string | undefined)
- `openaiApiKey` (string | undefined)
- `modelName` (string)
- `maxHistoryLength` (number)
- `logLevel` (string)
- `supportsVision(): boolean`
- `getTemperature(): number`

## Details

- `supportsVision()` returns true for models with image input capability.
- `getTemperature()` is 1.0 for GPT-5 models, otherwise 0.7.
