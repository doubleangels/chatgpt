import interactions
import sentry_sdk
import os
import sys
import logging
import openai
import signal
import re
import html.parser
import aiohttp
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
# Function to generate an AI response using OpenAI's GPT-4o-mini model.
async def generate_ai_response(conversation: list, channel) -> str:
    """
    Sends the conversation payload to OpenAI and returns the reply.
    Logs both the input and output for debugging.
    """
    try:
        # Log the input payload being sent to OpenAI.
        logger.debug("Sending conversation payload to OpenAI: %s", conversation)
        
        await channel.defer()
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

# Class and helper functions to derive direct links to gifs from Tenor/Giphy URLs.
class OGImageParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.og_image = None

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "meta":
            attr_dict = dict(attrs)
            if attr_dict.get("property") == "og:image" and "content" in attr_dict:
                self.og_image = attr_dict["content"]

def extract_og_image(html_text: str) -> str:
    parser = OGImageParser()
    parser.feed(html_text)
    return parser.og_image

async def fetch_direct_gif(url: str) -> str:
    """
    Fetches the page at `url` and attempts to extract a direct GIF URL from the og:image meta tag.
    Returns the direct image URL if found, or None otherwise.
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    logger.warning("Failed to retrieve URL %s (status %s)", url, response.status)
                    return None
                html_text = await response.text()
    except Exception:
        logger.exception("Error fetching URL %s", url)
        return None

    direct_url = extract_og_image(html_text)
    if direct_url:
        logger.debug("Extracted direct image URL %s from %s", direct_url, url)
    else:
        logger.debug("No og:image meta tag found for URL %s", url)
    return direct_url

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
      - Responds with GPT-4o-mini if:
          * the bot is mentioned,
          * an image is attached, or
          * the user is replying to one of the bot's messages.
      - Maintains conversation history per channel.
      - Logs user prompts.
    """
    try:
        message = event.message
        if not message:
            return

        channel_id = message.channel.id
        bot_mention = f"<@{bot.user.id}>"

        # Check if the message is a reply to another message and, if so, whether that message is from the bot.
        is_reply_to_bot = False
        referenced_message = None
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

        # Always ignore the bot's own messages.
        if message.author.id == bot.user.id:
            return

        # Only process the message if one of the following is true:
        #   - The message mentions the bot,
        #   - The message has image attachments, or
        #   - The message is a reply to a bot's message.
        if bot_mention not in message.content and not message.attachments and not is_reply_to_bot:
            return

        # Log the user prompt (replacing the raw bot mention with a friendly name).
        message_formatted = message.content.replace(bot_mention, "@ChatGPT")
        logger.debug(
            "User '%s' (ID: %s) sent a message in channel %s: %s",
            message.author.username, message.author.id, channel_id, message_formatted
        )

        # Extract image URLs from attachments, if any.
        image_urls = [
            attachment.url
            for attachment in message.attachments
            if attachment.content_type and attachment.content_type.startswith("image/")
        ]

        # Build the conversation payload.
        # Start with a system message.
        conversation = [
            {"role": "system", "content": "You are a helpful assistant that can analyze images and respond accordingly."}
        ]

        # If the user is replying to a bot message, include that message for context.
        if is_reply_to_bot and referenced_message:
            conversation.append({"role": "assistant", "content": referenced_message.content})

        # Prepare the user's message parts.
        user_message_parts = [{"type": "text", "text": message.content}]
        if image_urls:
            logger.debug("User '%s' uploaded %d image(s).", message.author.username, len(image_urls))
            user_message_parts.extend(
                [{"type": "image_url", "image_url": {"url": url}} for url in image_urls]
            )
        conversation.append({"role": "user", "content": user_message_parts})

        # Get the AI-generated reply.
        reply = await generate_ai_response(conversation, message.channel)
        if not reply:
            await message.channel.send("I couldn't generate a response.")
            return

        logger.debug("AI response to %s: %s", message.author.username, reply)
        # Send the reply in chunks if it is too long.
        for i in range(0, len(reply), 2000):
            await message.channel.send(reply[i: i + 2000])

        # Optionally, add the assistant's reply to the channel history.
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
    This updated version also analyzes photos, videos, and GIFs attached to the message.
    Additionally, it checks for Tenor/Giphy URLs in the message content and attempts to extract the direct GIF URL.
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

        # Extract text from the message.
        message_text = message.content or "No text found in message."

        # Extract attachments: images (including GIFs) and videos.
        attachment_parts = []
        for attachment in message.attachments:
            if not attachment.content_type:
                continue  # Skip attachments without a content type.
            if attachment.content_type.startswith("image/"):
                # This will capture both photos and GIFs.
                attachment_parts.append({"type": "image_url", "image_url": {"url": attachment.url}})
            elif attachment.content_type.startswith("video/"):
                attachment_parts.append({"type": "video_url", "video_url": {"url": attachment.url}})

        # Check message text for Tenor or Giphy URLs.
        # This regex will match URLs beginning with http or https that contain either 'tenor.com' or 'giphy.com'.
        tenor_giphy_pattern = r'(https?://(?:tenor\.com|giphy\.com)/\S+)'
        for url in re.findall(tenor_giphy_pattern, message_text):
            direct_url = await fetch_direct_gif(url)
            if direct_url:
                attachment_parts.append({"type": "image_url", "image_url": {"url": direct_url}})
                logger.debug("Added direct GIF URL %s from %s", direct_url, url)
            else:
                logger.debug("Could not resolve a direct GIF URL for %s", url)

        if attachment_parts:
            logger.debug("Message %s contains %d attachment(s) or resolved URLs.", message.id, len(attachment_parts))

        # Build the conversation payload.
        conversation = [
            {
                "role": "system",
                "content": "You are a helpful assistant that can analyze text, images, videos, and GIFs."
            }
        ]
        user_message_parts = [{"type": "text", "text": message_text}]
        # Append the extracted attachment parts.
        user_message_parts.extend(attachment_parts)
        conversation.append({"role": "user", "content": user_message_parts})

        # Defer the context menu response to allow processing time.
        await ctx.defer()

        reply = await generate_ai_response(conversation, ctx.channel)
        if not reply:
            await ctx.send("I couldn't generate a response.")
            return

        logger.debug("AI response: %s", reply)
        # Send the reply in chunks if it is too long.
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
