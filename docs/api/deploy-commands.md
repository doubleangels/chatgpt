# deploy-commands.js

Registers slash commands from the `commands/` directory with Discord.

## Export

- `deployCommands(): Promise<void>`

## Behavior

- Reads all `.js` files in `commands/`, converts `data` to JSON and registers via REST `Routes.applicationCommands(clientId)`.
- Uses `DISCORD_CLIENT_ID` or `config.clientId`.
- Logs progress and errors via `logger`.

## CLI

When executed directly (`node deploy-commands.js`), runs deployment and exits non-zero on failure.
