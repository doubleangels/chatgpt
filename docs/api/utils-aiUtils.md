# utils/aiUtils.js

Utility helpers for message formatting, splitting, image processing, and conversation history management.

## Exports

### splitMessage(text: string, limit = 2000): string[]
- Splits at paragraph, newline, sentence, then word boundaries; falls back to hard limit.
- Emits debug logs with chunk sizes and counts.

### downloadImageAsBase64(url: string): Promise<string>
- Streams image over HTTP(S) and returns a `data:<mime>;base64,<payload>` string.
- Rejects on non-200 responses.

### createMessageContent(text: string, imageContents: any[] = []): any[]
- Builds an array for OpenAI Responses API: `{ type: 'input_text', text }` plus any image entries.

### processImageAttachments(attachments: any[]): Promise<any[]>
- Filters to image attachments, downloads, and converts to `{ type: 'input_image', image_url: dataUrl }`.
- Logs per-image success/failure.

### hasImages(conversation: {role: string, content: any}[]): boolean
- Returns true if any message contains an `input_image` item.

### trimConversationHistory(channelHistory, maxHistoryLength): ConversationMessage[]
- Preserves the first system message and trims middle to max history length.

### createSystemMessage(modelName: string, supportsVision: boolean): ConversationMessage
- Creates a concise behavior prompt with model awareness and optional vision capabilities.

### SYSTEM_MESSAGES
- `BASE(modelName, visionCapability)` – core system prompt with formatting guidance
- `VISION_CAPABILITY.SUPPORTED` / `NOT_SUPPORTED`
- `IMAGE_ANALYSIS`, `IMAGE_DESCRIPTION_PROMPT`
