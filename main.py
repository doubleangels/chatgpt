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
def setup_logger():
    """Configures logging with file and console handlers."""
    logger = logging.getLogger("discord_bot")
    logger.setLevel(logging.DEBUG)  # Enable DEBUG for detailed troubleshooting.

    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    file_handler = RotatingFileHandler("bot.log", maxBytes=2_000_000, backupCount=5)
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)  # File logs INFO+ messages.

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.DEBUG)  # Console logs everything.

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


logger = setup_logger()

# -------------------------
# Environment Variable Check
# -------------------------
def get_env_var(var_name: str) -> str:
    """Fetches an environment variable and exits if missing."""
    value = os.getenv(var_name)
    if not value:
        logger.critical(f"{var_name} not found in environment variables. Exiting.")
        sys.exit(1)
    return value


TOKEN = get_env_var("DISCORD_BOT_TOKEN")
OPENAI_API_KEY = get_env_var("OPENAI_API_KEY")

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
            name="for pings!", type=interactions.ActivityType.WATCHING
        ),
    )
    logger.info("Bot is online and ready!")


@interactions.listen()
async def on_message_create(event: interactions.api.events.MessageCreate):
    """
    Handles incoming messages:
      - Ignores bot's own messages.
      - Detects mentions to reply with GPT-4o-mini.
      - Maintains conversation history per channel.
    """
    message = event.message
    if not message:
        return

    channel_id = message.channel.id
    mention_str = f"<@{bot.user.id}>"

    # Log incoming messages for debugging (only relevant ones)
    if mention_str in message.content:
        logger.info(f"Received mention from {message.author.username} in channel {channel_id}")

    # -------------------------
    # Detect if replying to the bot
    # -------------------------
    is_reply_to_bot = False
    if message.message_reference and message.message_reference.message_id:
        try:
            referenced_message = await message.channel.fetch_message(message.message_reference.message_id)
            is_reply_to_bot = referenced_message and referenced_message.author.id == bot.user.id
        except Exception as e:
            logger.warning(f"Failed to fetch referenced message in channel {channel_id}: {e}")

    if message.author.id == bot.user.id or is_reply_to_bot:
        return

    # -------------------------
    # GPT-4 Response Handling
    # -------------------------
    if mention_str in message.content:
        channel_message_history[channel_id].append({"role": "user", "content": message.content})

        conversation = [{"role": "system", "content": "You are a helpful assistant."}]
        conversation.extend(channel_message_history[channel_id])

        try:
            await message.channel.trigger_typing()

            response = openai.chat.completions.create(
                model="gpt-4o-mini", messages=conversation, max_tokens=500, temperature=0.7
            )
            
            if not response.choices:
                logger.error("OpenAI API returned no choices.")
                await message.channel.send("I couldn't generate a response.")
                return
            
            reply = response.choices[0].message.content

            # Log AI response before sending
            logger.debug(f"AI response to {message.author.username}: {reply[:100]}...")

            # Send messages in chunks if too long
            for i in range(0, len(reply), 2000):
                await message.channel.send(reply[i : i + 2000])

            channel_message_history[channel_id].append({"role": "assistant", "content": reply})

        except Exception as e:
            logger.error("Exception occurred during message processing!", exc_info=True)
            await message.channel.send("An error occurred while processing your request.")

# -------------------------
# Bot Startup
# -------------------------
try:
    logger.info("Starting bot...")
    bot.start(TOKEN)
except Exception as e:
    logger.critical("Exception occurred during bot startup!", exc_info=True)
    sys.exit(1)
