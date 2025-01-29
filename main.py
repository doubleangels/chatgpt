import interactions
import sentry_sdk
import os
import sys
import logging
from logging.handlers import RotatingFileHandler
import openai
from collections import defaultdict, deque

# -------------------------
# Sentry Setup
# -------------------------
sentry_sdk.init(
    dsn="https://eec36346892467255ce18e6fed4ef80d@o244019.ingest.us.sentry.io/4508717394034688",
    traces_sample_rate=1.0,
    profiles_sample_rate=1.0,
    enable_tracing=True,
)

# -------------------------
# Logger Configuration
# -------------------------
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

file_handler = RotatingFileHandler("bot.log", maxBytes=2_000_000, backupCount=5)
file_handler.setLevel(logging.INFO)

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)

formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
file_handler.setFormatter(formatter)
console_handler.setFormatter(formatter)

logger.addHandler(file_handler)
logger.addHandler(console_handler)

# -------------------------
# Environment Variable Check
# -------------------------
required_env_vars = {
    "DISCORD_BOT_TOKEN": os.getenv("DISCORD_BOT_TOKEN"),
    "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY")
}

missing_vars = [key for key, value in required_env_vars.items() if not value]
if missing_vars:
    for var in missing_vars:
        logger.error(f"{var} not found in environment variables.")
    sys.exit(1)

TOKEN = required_env_vars["DISCORD_BOT_TOKEN"]
OPENAI_API_KEY = required_env_vars["OPENAI_API_KEY"]

# -------------------------
# OpenAI Configuration
# -------------------------
openai.api_key = OPENAI_API_KEY

channel_message_history = defaultdict(lambda: deque(maxlen=10))

# -------------------------
# Discord Bot Setup
# -------------------------
bot = interactions.Client(token=TOKEN, sync_commands=True)

# -------------------------
# Event Listeners
# -------------------------
@interactions.listen()
async def on_ready():
    """Triggered when the bot successfully connects to Discord."""
    await bot.change_presence(
            status=interactions.Status.ONLINE,
            activity=interactions.Activity(
                name="for pings!",
                type=interactions.ActivityType.WATCHING
            )
        )
    logger.info("I am online and ready!")

@interactions.listen()
async def on_message_create(event: interactions.api.events.MessageCreate):
    """
    Called for every message the bot can see. We:
      - Ignore the bot's own messages to prevent loops.
      - Check if the bot is mentioned. If so:
        1. Add user mention to the rolling history.
        2. Build the GPT-4 conversation and get a response.
        3. Send the response.
        4. Store the bot's response.
    """
    message = event.message
    channel_id = event.message.channel.id
    mention_str = f"<@{bot.user.id}>"

    is_reply_to_bot = False
    if message.message_reference and message.message_reference.message_id:
        try:
            referenced_message = await message.channel.fetch_message(message.message_reference.message_id)
            if referenced_message and referenced_message.author.id == bot.user.id:
                is_reply_to_bot = True
        except Exception as e:
            logger.warning(f"Failed to fetch referenced message: {e}")

    if message.author.id == bot.user.id or is_reply_to_bot:
        return

    if mention_str in message.content:
        channel_message_history[channel_id].append(
            {"role": "user", "content": message.content}
        )

        conversation = [
            {"role": "system", "content": "You are a helpful assistant."}
        ]
        conversation.extend(channel_message_history[channel_id])

        try:
            await message.channel.trigger_typing()
            response = openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=conversation,
                max_tokens=500,
                temperature=0.7,
            )
            
            reply = response.choices[0].message.content

            if len(reply) > 2000:
                parts = [reply[i:i+2000] for i in range(0, len(reply), 2000)]
                for part in parts:
                    await message.channel.send(part)
            else:
                await message.channel.send(reply)

            channel_message_history[channel_id].append(
                {"role": "assistant", "content": reply}
            )
        except Exception as e:
            logger.error("Exception occurred during message processing!", exc_info=True)

# -------------------------
# Bot Startup
# -------------------------
try:
    bot.start(TOKEN)
except Exception as e:
    logger.error("Exception occurred during bot startup!", exc_info=True)
    sys.exit(1)
