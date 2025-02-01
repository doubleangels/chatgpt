import interactions
import sentry_sdk
import os
import sys
import logging
import openai
import signal
from collections import defaultdict, deque
from sentry_sdk.integrations.logging import LoggingIntegration

# -------------------------
# Sentry Setup with Logging Integration
# -------------------------
sentry_logging = LoggingIntegration(
    level=logging.DEBUG,        # Capture info and above as breadcrumbs
    event_level=logging.ERROR   # Send errors as events
)

sentry_sdk.init(
    dsn="https://eec36346892467255ce18e6fed4ef80d@o244019.ingest.us.sentry.io/4508717394034688",
    integrations=[sentry_logging],
    traces_sample_rate=1.0,
    profiles_sample_rate=1.0,
)

# -------------------------
# Logger Configuration for Docker (Console Only)
# -------------------------
# Set log level from environment variable (default is DEBUG).
LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG").upper()

logger = logging.getLogger("ChatGPT")
logger.setLevel(LOG_LEVEL)

# Enhanced formatter: includes timestamp, logger name, level, filename, and line number.
log_format = "%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s"
formatter = logging.Formatter(log_format)

# Console handler: logs to stdout (Docker captures stdout automatically).
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(LOG_LEVEL)
console_handler.setFormatter(formatter)
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
        # Missing required environment variables are critical, so leaving at INFO level.
        logger.info(f"{var} not found in environment variables.")
    sys.exit(1)

TOKEN = required_env_vars["DISCORD_BOT_TOKEN"]
OPENAI_API_KEY = required_env_vars["OPENAI_API_KEY"]

# -------------------------
# OpenAI Configuration
# -------------------------
openai.api_key = OPENAI_API_KEY
MODEL_NAME = "gpt-4o-mini"  # Constant for the model name

# -------------------------
# Conversation History per Channel
# -------------------------
channel_message_history = defaultdict(lambda: deque(maxlen=10))

# -------------------------
# Discord Bot Setup
# -------------------------
bot = interactions.Client(token=TOKEN, sync_commands=True)

def handle_interrupt(signal_num, frame):
    """
    Handles shutdown signals (SIGINT, SIGTERM) gracefully.
    """
    logger.info("Gracefully shutting down.")
    sys.exit(0)

signal.signal(signal.SIGINT, handle_interrupt)
signal.signal(signal.SIGTERM, handle_interrupt)

# -------------------------
# Helper Function: Generate AI Response
# -------------------------
async def generate_ai_response(conversation: list, channel) -> str:
    """
    Sends the conversation payload to OpenAI and returns the reply.
    Logs both the input and output for debugging.
    """
    try:
        # Log the input payload being sent to OpenAI.
        logger.debug("Sending conversation payload to OpenAI: %s", conversation)
        
        await channel.trigger_typing()
        response = openai.chat.completions.create(
            model=MODEL_NAME,
            messages=conversation,
            max_tokens=500,
            temperature=0.7,
        )
        
        # Log the raw response from OpenAI.
        logger.debug("Received response from OpenAI: %s", response)
        
        if not response.choices:
            logger.debug("OpenAI API returned no choices.")
            return ""
        reply = response.choices[0].message.content
        
        # Log the final reply extracted from the response.
        logger.debug("Final reply from OpenAI: %s", reply)
        return reply
    except Exception:
        logger.exception("Exception occurred during GPT-4o-mini response generation.")
        return ""

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
    # High-level operational message; remains INFO.
    logger.info("I am online and ready!")

@interactions.listen()
async def on_message_create(event: interactions.api.events.MessageCreate):
    """
    Handles incoming messages:
      - Ignores the bot's own messages.
      - Responds with GPT-4o-mini if the bot is mentioned or an image is attached.
      - Maintains conversation history per channel.
      - Logs user prompt if the bot is mentioned.
    """
    try:
        message = event.message
        if not message:
            return

        channel_id = message.channel.id
        bot_mention = f"<@{bot.user.id}>"

        # Check if the message is a reply to the bot.
        is_reply_to_bot = False
        if message.message_reference and message.message_reference.message_id:
            try:
                referenced_message = await message.channel.fetch_message(
                    message.message_reference.message_id
                )
                is_reply_to_bot = referenced_message and (referenced_message.author.id == bot.user.id)
            except Exception:
                logger.exception(
                    "Failed to fetch referenced message in channel %s. Possible permissions issue.",
                    channel_id
                )

        # Ignore the bot's own messages or messages replying to the bot.
        if message.author.id == bot.user.id or is_reply_to_bot:
            return

        # Check for bot mention or image attachments.
        if bot_mention in message.content or message.attachments:
            # Replace the mention with a friendly name for logging purposes.
            message_formatted = message.content.replace(bot_mention, "@ChatGPT")
            # Detailed user activity: using DEBUG level.
            logger.debug(
                "User '%s' (ID: %s) mentioned the bot in channel %s with prompt: %s",
                message.author.username, message.author.id, channel_id, message_formatted
            )

            # Extract image URLs from attachments (if any).
            image_urls = [
                attachment.url
                for attachment in message.attachments
                if attachment.content_type and attachment.content_type.startswith("image/")
            ]

            # Build the conversation payload.
            conversation = [
                {"role": "system", "content": "You are a helpful assistant that can analyze images and respond accordingly."}
            ]
            user_message_parts = [{"type": "text", "text": message.content}]
            if image_urls:
                logger.debug("User '%s' uploaded %d image(s).", message.author.username, len(image_urls))
                user_message_parts.extend(
                    [{"type": "image_url", "image_url": {"url": url}} for url in image_urls]
                )
            conversation.append({"role": "user", "content": user_message_parts})

            # Get AI-generated reply.
            reply = await generate_ai_response(conversation, message.channel)
            if not reply:
                await message.channel.send("I couldn't generate a response.")
                return

            logger.debug("AI response to %s: %s", message.author.username, reply)
            # Send the reply in chunks if it's too long.
            for i in range(0, len(reply), 2000):
                await message.channel.send(reply[i: i + 2000])

            # Add assistant reply to channel history.
            channel_message_history[channel_id].append({"role": "assistant", "content": reply})
    except Exception:
        logger.exception("Unexpected error in on_message_create.")

# -------------------------
# Slash Commands
# -------------------------
@interactions.slash_command(name="reset", description="Reset the entire conversation history for all users and channels.")
async def reset(ctx: interactions.ComponentContext):
    """
    Resets the entire conversation history for all users and channels globally.
    Only admins can use this command.
    """
    if not ctx.author.has_permission(interactions.Permissions.ADMINISTRATOR):
        await ctx.send("You do not have permission to use this command.", ephemeral=True)
        return

    channel_message_history.clear()
    await ctx.send("Global conversation history has been reset.", ephemeral=True)

# -------------------------
# Context Menu Command: Analyze with ChatGPT
# -------------------------
@interactions.message_context_menu(name="Analyze with ChatGPT")
async def analyze_message(ctx: interactions.ContextMenuContext):
    """
    Allows users to right-click a message, select 'Apps', and analyze it with GPT-4o-mini.
    """
    try:
        message: interactions.Message = ctx.target  # The selected message.
        if not message:
            await ctx.send("Could not retrieve the message.", ephemeral=True)
            return

        channel_id = message.channel.id
        logger.debug(
            "User '%s' (ID: %s) requested analysis for message %s in channel %s",
            ctx.author.username, ctx.author.id, message.id, channel_id
        )

        # Extract text and image URLs from the message.
        message_text = message.content or "No text found in message."
        image_urls = [
            attachment.url
            for attachment in message.attachments
            if attachment.content_type and attachment.content_type.startswith("image/")
        ]

        # Build the conversation payload for analysis.
        conversation = [
            {"role": "system", "content": "You are a helpful assistant that can analyze text and images."}
        ]
        user_message_parts = [{"type": "text", "text": message_text}]
        if image_urls:
            logger.debug("Message %s contains %d image(s).", message.id, len(image_urls))
            user_message_parts.extend(
                [{"type": "image_url", "image_url": {"url": url}} for url in image_urls]
            )
        conversation.append({"role": "user", "content": user_message_parts})

        # Defer the context menu response to allow processing time.
        await ctx.defer()

        reply = await generate_ai_response(conversation, ctx.channel)
        if not reply:
            await ctx.send("I couldn't generate a response.")
            return

        logger.debug("AI response: %s", reply)
        for i in range(0, len(reply), 2000):
            await ctx.send(reply[i: i + 2000])
    except Exception:
        logger.exception("Unexpected error in Analyze with ChatGPT command.")
        await ctx.send("An unexpected error occurred.", ephemeral=True)

# -------------------------
# Bot Startup
# -------------------------
try:
    bot.start(TOKEN)
except Exception:
    logger.error("Exception occurred during bot startup!", exc_info=True)
    sys.exit(1)
