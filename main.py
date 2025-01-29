import interactions
import sentry_sdk
import os
import sys
import logging
import signal
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
    """
    Configures logging with both file and console handlers.
    File logs are set to INFO, console logs to DEBUG for detailed output.
    """
    logger = logging.getLogger("discord_bot")
    logger.setLevel(logging.DEBUG)  # Enable DEBUG for detailed troubleshooting.

    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

    file_handler = RotatingFileHandler("bot.log", maxBytes=2_000_000, backupCount=5)
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)  # File logs INFO and above.

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.DEBUG)  # Console logs everything.

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    return logger

logger = setup_logger()

# -------------------------
# Graceful Shutdown
# -------------------------
def handle_shutdown(signum, frame):
    """
    Gracefully shuts down when receiving SIGINT or SIGTERM.
    """
    logger.info(f"Shutting down gracefully.")
    sys.exit(0)

signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

# -------------------------
# Environment Variable Check
# -------------------------
def get_env_var(var_name: str) -> str:
    """
    Fetches an environment variable, logs critical error, and exits if missing.
    """
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

# Holds up to 10 messages per channel, so the GPT model remembers context.
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
    """
    Triggered when the bot successfully connects to Discord.
    Sets status/activity, logs readiness.
    """
    try:
        await bot.change_presence(
            status=interactions.Status.ONLINE,
            activity=interactions.Activity(
                name="for pings!",
                type=interactions.ActivityType.WATCHING
            ),
        )
        logger.info("Bot is online and ready!")
    except Exception:
        logger.exception("Error occurred while setting bot presence.")

@interactions.listen()
async def on_message_create(event: interactions.api.events.MessageCreate):
    """
    Handles incoming messages:
      - Ignores the bot's own messages.
      - Responds with GPT-4o-mini if the bot is mentioned.
      - Maintains conversation history per channel.
      - Logs user prompt if the bot is mentioned.
    """
    try:
        message = event.message
        if not message:
            return

        channel_id = message.channel.id
        mention_str = f"<@{bot.user.id}>"

        # Check if this message is replying to the bot's own message
        is_reply_to_bot = False
        if message.message_reference and message.message_reference.message_id:
            try:
                referenced_message = await message.channel.fetch_message(message.message_reference.message_id)
                is_reply_to_bot = bool(referenced_message and referenced_message.author.id == bot.user.id)
            except Exception:
                logger.exception(
                    f"Failed to fetch referenced message in channel {channel_id}. Possible permissions issue."
                )

        # Ignore the bot's own messages or messages replying to the bot
        if message.author.id == bot.user.id or is_reply_to_bot:
            return

        if mention_str in message.content:
            # Log the user's prompt
            logger.debug(
                f"User '{message.author.username}' mentioned the bot in channel {channel_id} with prompt:\n"
                f"{message.content}"
            )

            # Add user message to conversation history
            channel_message_history[channel_id].append({"role": "user", "content": message.content})

            # Build conversation context
            conversation = [{"role": "system", "content": "You are a helpful assistant."}]
            conversation.extend(channel_message_history[channel_id])

            try:
                await message.channel.trigger_typing()
                response = openai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=conversation,
                    max_tokens=500,
                    temperature=0.7
                )

                if not response.choices:
                    logger.error("OpenAI API returned no choices.")
                    await message.channel.send("I couldn't generate a response.")
                    return

                reply = response.choices[0].message.content
                logger.debug(f"AI response (first 100 chars) to {message.author.username}: {reply[:100]}...")

                # Send the reply in chunks if needed
                for i in range(0, len(reply), 2000):
                    await message.channel.send(reply[i : i + 2000])

                # Add assistant reply to channel history
                channel_message_history[channel_id].append({"role": "assistant", "content": reply})

            except Exception:
                logger.exception("Exception occurred during GPT-4o-mini response generation.")
                await message.channel.send("An error occurred while processing your request.")

    except Exception:
        # Catch any unexpected errors in the event listener
        logger.exception("Unexpected error in on_message_create.")

# -------------------------
# Bot Startup
# -------------------------
try:
    logger.info("Starting bot...")
    bot.start(TOKEN)
except Exception:
    logger.critical("Exception occurred during bot startup!", exc_info=True)
    sys.exit(1)
