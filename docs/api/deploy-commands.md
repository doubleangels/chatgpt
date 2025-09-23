# deploy-commands.js

Registers slash commands from the `commands/` directory with Discord.

## Export

- `deployCommands(): Promise<void>`

## Behavior

- Reads all `.js` files in `commands/`, converts `data` to JSON and registers via REST `Routes.applicationCommands(clientId)`.
- Uses `DISCORD_CLIENT_ID` (env) or `config.clientId`.
- Logs progress (loaded files, application ID) and errors with stack.
- Throws on failure so CI can fail fast.

## Example

```bash
node deploy-commands.js
```

```js
const deploy = require('./deploy-commands');
await deploy();
```

## Notes

- Requires a valid bot token in environment (via `config.token`).
