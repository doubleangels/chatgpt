# utils/aiUtils.js

Utility helpers for message formatting, splitting, image processing, and conversation history management.

## Exports

- `splitMessage(text: string, limit?: number): string[]`
- `downloadImageAsBase64(url: string): Promise<string>`
- `createMessageContent(text: string, imageContents?: any[]): any[]`
- `processImageAttachments(attachments: any[]): Promise<any[]>`
- `hasImages(conversation: {role: string, content: any}[]): boolean`
- `trimConversationHistory(channelHistory: {role: string, content: any}[], maxHistoryLength: number): {role: string, content: any}[]`
- `createSystemMessage(modelName: string, supportsVision: boolean): {role: string, content: any}`
- `SYSTEM_MESSAGES`: constants for base/system prompts

## Notes

- `splitMessage` prefers paragraph/sentence/word boundaries before falling back to hard limits.
- `downloadImageAsBase64` auto-detects HTTP/HTTPS and returns a data URL with MIME type.
- `createSystemMessage` embeds concise behavior guidelines and vision capabilities.
