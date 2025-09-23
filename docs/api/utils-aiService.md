# utils/aiService.js

AI service responsible for calling OpenAI's API and returning responses.

## Export

- `generateAIResponse(conversation: {role: string, content: string|any[]}[]): Promise<string>`

## Parameters

- `conversation`: ordered messages including a persistent system message at index 0, followed by `user` and `assistant` turns. For multimodal, `content` may be an array including `input_text` and `input_image` entries.

## Returns

- A string reply from the model. Returns empty string on failure and logs details.

## Flow

1. Select token parameter name via `getTokenParameterName(modelName)`.
2. Copy conversation. If images present, append `SYSTEM_MESSAGES.IMAGE_ANALYSIS`.
3. Build request with `model`, `input`, and optional `temperature` from `getTemperature()`.
4. Call `openai.responses.create` and validate `status === 'completed'`.
5. Extract `response.output_text` and return.

## Logging

- Request metadata (model, message count, temperature), response summary (id, status, tokens), and detailed error info (stack, code/status).
