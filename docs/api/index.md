# index.js

Entry point that initializes the Discord client, loads commands and events, and wires up interaction handlers.

## Client

- Creates a Discord `Client` with intents:
  - `Guilds`, `GuildMessages`, `MessageContent`
- Adds registries to the client:
  - `client.commands: Collection<string, { data: any, execute: Function }>`
  - `client.conversationHistory: Map<string, { role: string, content: any }[]>`

## Command loading

- Scans `commands/` for `.js` files
- Each module must export `{ data: SlashCommandBuilder, execute(interaction) }`
- Loaded commands are keyed by `command.data.name`
- Logs errors with file name and stack on failure

## Event loading

- Scans `events/` for `.js` files
- Supports:
  - `once: true` → registered with `client.once(event.name, handler)`
  - otherwise → `client.on(event.name, handler)`
- Wrapper logs `Executing event: <name>` and catches exceptions per emit

## Interaction handlers

### Slash commands

- Listens to `interactionCreate`
- Checks `interaction.isChatInputCommand()`
- Looks up `client.commands.get(interaction.commandName)` and `await command.execute(interaction)`
- On error, logs and attempts to send an ephemeral error response (uses `reply` or `followUp` depending on state)

### Context menu commands

- Listens to `interactionCreate`
- Checks `interaction.isContextMenuCommand()`
- Executes via the same `execute(interaction)` signature
- Emits debug logs around execution and success

## Process lifecycle

- Logs in with `config.token`
- Global process handlers:
  - `uncaughtException` → logs and exits after 1s
  - `unhandledRejection` → logs reason/stack
  - `SIGINT` / `SIGTERM` → logs and exits cleanly

## Notes

- Conversation history is stored per channel in-memory and is consumed by the message event to build prompts for the AI service.
- All error logs include `stack`, `message`, and relevant user/guild/channel metadata when available.
