# utils/aiService.js

AI service responsible for calling OpenAI's API and returning responses.

## Export

- `generateAIResponse(conversation: {role: string, content: string|any[]}[]): Promise<string>`

## Internals

- Uses `OpenAI` client with `openaiApiKey`.
- Token parameter name is chosen per model: `max_completion_tokens` for GPT-5, `max_tokens` otherwise.
- Adds `SYSTEM_MESSAGES.IMAGE_ANALYSIS` when images are present.
- Optionally sets `temperature` from `getTemperature()`.

## Logging

- Logs request params (safe details), response metadata, and errors with stack and status.
