#!/bin/sh
set -e

# Ensure /usr/local/bin is in PATH for bws command
export PATH=$PATH:/usr/local/bin

# Configure bws to use /tmp for state directory (writable tmpfs) - do this early
# Create bws config directory and file before any bws commands
mkdir -p /tmp/.bws
cat > /tmp/.bws/config.json <<EOF
{
  "state_dir": "/tmp/.bws"
}
EOF
export BW_SECRETS_MANAGER_STATE_PATH=/tmp/.bws
export BWS_CONFIG_DIR=/tmp/.bws
# Set HOME to /tmp so bws uses /tmp/.bws as default location
export HOME=/tmp

# Retrieve secrets from Bitwarden and export them
export DISCORD_BOT_TOKEN=$(bws secret get f4ae7c23-49d6-4e84-9ab2-b3c9015e33a8 2>/dev/null | jq -r '.value')
export DISCORD_CLIENT_ID=$(bws secret get 6eeb91a0-d353-40ed-972e-b3c9015e5101 2>/dev/null | jq -r '.value')
export LOG_LEVEL=$(bws secret get 8d4bad36-599b-4de5-856a-b3c9015efb4e 2>/dev/null | jq -r '.value')
export MAX_HISTORY_LENGTH=$(bws secret get e957f841-7c04-4aea-9a6a-b3c9015ea3ad 2>/dev/null | jq -r '.value')
export MODEL_NAME=$(bws secret get 93f40e94-f127-41da-990d-b3c9015e89f5 2>/dev/null | jq -r '.value')
export OPENAI_API_KEY=$(bws secret get 2380da26-4120-4f9f-a8bc-b3c9015e7487 2>/dev/null | jq -r '.value')
export REASONING_EFFORT=$(bws secret get 19a9ee05-2b3f-419d-9d68-b3c9015ebeb8 2>/dev/null | jq -r '.value')
export RESPONSES_VERBOSITY=$(bws secret get fee44254-3ab6-4f94-a221-b3c9015ee682 2>/dev/null | jq -r '.value')

# Execute the main command (gosu will switch to discordbot user)
exec "$@"

