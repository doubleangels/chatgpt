# index.js

Entry point that initializes the Discord client, loads commands and events, and wires up interaction handlers.

## Exports

- None (side-effectful startup script)

## Types

- `client.commands` – Collection<string, { data: any, execute: Function }>
- `client.conversationHistory` – Map<string, { role: string, content: any }[]>

## Events

- One-time and recurring listeners wrap handlers from `events/` with logging and error handling.
- Slash command handler: listens to `interactionCreate` when `interaction.isChatInputCommand()`.
- Context menu handler: listens to `interactionCreate` when `interaction.isContextMenuCommand()`.

## Notes

- Conversation history is stored in-memory per channel.
- Errors are logged with stack, message and relevant IDs.
