import html.parser
import logging
import os
import re
import signal
import sys
from collections import defaultdict, deque

import aiohttp
import interactions
import openai
import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

# -------------------------
# Sentry Setup with Logging Integration
# -------------------------
sentry_logging = LoggingIntegration(
    level=logging.DEBUG,        # Capture debug and above as breadcrumbs
    event_level=logging.ERROR   # Send errors as events
)

sentry_sdk.init(
    dsn="https://eec36346892467255ce18e6fed4ef80d@o244019.ingest.us.sentry.io/4508717394034688",
    integrations=[sentry_logging],
    traces_sample_rate=1.0,
    profiles_sample_rate=1.0,
)

# -------------------------
# Logger Configuration
# -------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG").upper()
logger = logging.getLogger("ChatGPT")
logger.setLevel(LOG_LEVEL)

log_format = "%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s"
formatter = logging.Formatter(log_format)

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(LOG_LEVEL)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

# -------------------------
# Helper for Exception Logging & Sentry Capture
# -------------------------
def handle_exception(e, context: str = ""):
    message = f"{context} - Exception: {e}"
    logger.exception(message)
    sentry_sdk.capture_exception(e)

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
        logger.critical(f"{var} not found in environment variables.")
    sys.exit(1)

TOKEN = required_env_vars["DISCORD_BOT_TOKEN"]
OPENAI_API_KEY = required_env_vars["OPENAI_API_KEY"]

# -------------------------
# OpenAI Configuration
# -------------------------
openai.api_key = OPENAI_API_KEY
MODEL_NAME = "gpt-4o-mini"

# -------------------------
# Conversation History per Channel
# -------------------------
channel_message_history = defaultdict(lambda: deque(maxlen=10))

# -------------------------
# Discord Bot Setup
# -------------------------
bot = interactions.Client(token=TOKEN, sync_commands=True)

# -------------------------
# Graceful Shutdown Handling
# -------------------------
def handle_interrupt(signal_num, frame):
    logger.info("Shutdown signal received. Cleaning up and shutting down gracefully.")
    sys.exit(0)

signal.signal(signal.SIGINT, handle_interrupt)
signal.signal(signal.SIGTERM, handle_interrupt)

# -------------------------
# Helper Function: Generate AI Response
# -------------------------
async def generate_ai_response(conversation: list, channel) -> str:
    try:
        logger.debug(f"Sending conversation payload to OpenAI: {conversation}")
        response = openai.chat.completions.create(
            model=MODEL_NAME,
            messages=conversation,
            max_tokens=500,
            temperature=0.7,
        )
        logger.debug(f"Received response from OpenAI: {response}")

        if not response.choices:
            logger.warning("OpenAI API returned no choices.")
            return ""

        reply = response.choices[0].message.content
        logger.debug(f"Final reply from OpenAI: {reply}")
        return reply

    except Exception as e:
        handle_exception(e, "Error during AI response generation")
        return ""

# -------------------------
# OG Image Extractor
# -------------------------
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
    if parser.og_image:
        logger.debug(f"Extracted OG image URL: {parser.og_image}")
    else:
        logger.warning("No og:image meta tag found in the HTML.")
    return parser.og_image

async def fetch_direct_gif(url: str) -> str:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    logger.warning(f"Failed to retrieve URL {url} (status {response.status}).")
                    return None
                html_text = await response.text()
    except Exception as e:
        handle_exception(e, f"Error fetching URL {url}")
        return None

    try:
        direct_url = extract_og_image(html_text)
        if direct_url:
            logger.debug(f"Extracted direct GIF URL {direct_url} from {url}")
        else:
            logger.warning(f"No OG image found for URL {url}")
        return direct_url
    except Exception as e:
        handle_exception(e, f"Error extracting OG image from URL {url}")
        return None

# -------------------------
# Event Listeners
# -------------------------
@interactions.listen()
async def on_ready():
    try:
        await bot.change_presence(
            status=interactions.Status.ONLINE,
            activity=interactions.Activity(
                name="for pings! 📡",
                type=interactions.ActivityType.WATCHING
            )
        )
        logger.info("I am online and ready!")
    except Exception as e:
        handle_exception(e, "Error during on_ready event")

@interactions.listen()
async def on_message_create(event: interactions.api.events.MessageCreate):
    try:
        message = event.message
        if not message:
            return

        channel_id = message.channel.id
        user_id = message.author.id
        bot_mention = f"<@{bot.user.id}>"

        # Check if the message is a reply to another message and whether that message is from the bot
        is_reply_to_bot = False
        referenced_message = None
        if message.message_reference and message.message_reference.message_id:
            try:
                referenced_message = await message.channel.fetch_message(
                    message.message_reference.message_id
                )
                is_reply_to_bot = (referenced_message and referenced_message.author.id == bot.user.id)
            except Exception as e:
                handle_exception(e, f"Failed to fetch referenced message in channel {channel_id}")

        # Ignore the bot's own messages
        if user_id == bot.user.id:
            return

        # Only handle the message if:
        #   - The bot is mentioned,
        #   - The message has image attachments, or
        #   - The message is a reply to a bot's message
        if bot_mention not in message.content and not message.attachments and not is_reply_to_bot:
            return
        elif bot_mention in message.content:
            await message.channel.trigger_typing()

        logger.debug(f"Bot triggered by message {message.id} in channel {channel_id}.")

        # Prepare user content
        user_text = message.content.replace(bot_mention, "@ChatGPT")
        logger.debug(
            f"User '{message.author.username}' (ID: {user_id}) in channel {channel_id}: {user_text}"
        )

        image_urls = [
            attachment.url
            for attachment in message.attachments
            if attachment.content_type and attachment.content_type.startswith("image/")
        ]

        user_message_parts = [{"type": "text", "text": user_text}]
        for url in image_urls:
            user_message_parts.append({"type": "image_url", "image_url": {"url": url}})

        # Retrieve and build the conversation history
        conversation_history = channel_message_history[channel_id]
        conversation = list(conversation_history)

        if not conversation or conversation[0].get("role") != "system":
            conversation.insert(
                0,
                {
                    "role": "system",
                    "content": (
                        "You are a helpful assistant that can analyze text, images, videos, and GIFs."
                        "The users that you help know that you can't send messages on their behalf."
                        "Please send responses in a clear and consise manner, using Discord message formatting."
                        "Limit responses to less than 2000 characters."
                        "Maintain conversation continuity and context."
                    ),
                },
            )

        # Optionally include the referenced message if the user is replying to the bot
        if is_reply_to_bot and referenced_message:
            conversation.append({"role": "assistant", "content": referenced_message.content})

        # Append the new user message
        conversation.append({"role": "user", "content": user_message_parts})

        # Get AI-generated reply
        reply = await generate_ai_response(conversation, message.channel)
        if not reply:
            await message.channel.send("⚠️ I couldn't generate a response.", reply_to=message.id)
            return

        # Send the reply in chunks if too long
        for i in range(0, len(reply), 2000):
            await message.channel.send(reply[i: i + 2000], reply_to=message.id)

        # Update conversation history
        conversation_history.append({"role": "user", "content": user_message_parts})
        conversation_history.append({"role": "assistant", "content": reply})

    except Exception as e:
        handle_exception(e, f"Unexpected error in on_message_create (Channel ID: {message.channel.id if message else 'N/A'})")

# -------------------------
# Slash Commands
# -------------------------
@interactions.slash_command(name="reset", description="Reset the entire conversation history.")
async def reset(ctx: interactions.ComponentContext):
    try:
        if not ctx.author.has_permission(interactions.Permissions.ADMINISTRATOR):
            logger.warning(f"Unauthorized /reset attempt by {ctx.author.username} ({ctx.author.id})")
            await ctx.send("❌ You do not have permission to use this command.", ephemeral=True)
            return

        channel_message_history.clear()
        logger.info(f"Conversation history reset by {ctx.author.username} ({ctx.author.id})")
        await ctx.send("🗑️ **Global conversation history has been reset.**", ephemeral=True)
    except Exception as e:
        handle_exception(e, f"Error in /reset command by {ctx.author.username} ({ctx.author.id})")
        await ctx.send("⚠️ An error occurred while resetting the conversation history.", ephemeral=True)

# -------------------------
# Context Menu Command
# -------------------------
@interactions.message_context_menu(name="Analyze with ChatGPT")
async def analyze_message(ctx: interactions.ContextMenuContext):
    try:
        message: interactions.Message = ctx.target  # The selected message.
        if not message:
            await ctx.send("❌ Could not retrieve the message.", ephemeral=True)
            return

        channel_id = message.channel.id
        logger.debug(
            f"User '{ctx.author.username}' (ID: {ctx.author.id}) requested analysis for message {message.id} in channel {channel_id}"
        )

        # Extract text
        message_text = message.content or "📜 No text found in message."

        # Extract attachments
        attachment_parts = []
        for attachment in message.attachments:
            if not attachment.content_type:
                continue
            if attachment.content_type.startswith("image/"):
                attachment_parts.append({"type": "image_url", "image_url": {"url": attachment.url}})
            elif attachment.content_type.startswith("video/"):
                attachment_parts.append({"type": "video_url", "video_url": {"url": attachment.url}})

        # Check for Tenor/Giphy URLs in the message text
        tenor_giphy_pattern = r"(https?://(?:tenor\.com|giphy\.com)/\S+)"
        for url in re.findall(tenor_giphy_pattern, message_text):
            direct_url = await fetch_direct_gif(url)
            if direct_url:
                attachment_parts.append({"type": "image_url", "image_url": {"url": direct_url}})
                logger.debug(f"Added direct GIF URL {direct_url} from {url}")

        user_message_parts = [{"type": "text", "text": message_text}]
        user_message_parts.extend(attachment_parts)

        # Get conversation history
        conversation_history = channel_message_history[channel_id]
        conversation = list(conversation_history)

        # Insert system message if none
        if not conversation or conversation[0].get("role") != "system":
            conversation.insert(
                0,
                {
                    "role": "system",
                    "content": (
                        "You are a helpful assistant that can analyze text, images, videos, and GIFs."
                        "The users that you help know that you can't send messages on their behalf."
                        "Send responses in a clear and consise manner, using Discord message formatting."
                        "Limit responses to less than 2000 characters."
                        "Maintain conversation continuity and context."
                    ),
                },
            )

        # Append user's new analysis request
        conversation.append({"role": "user", "content": user_message_parts})

        await ctx.defer()

        reply = await generate_ai_response(conversation, ctx.channel)
        if not reply:
            await ctx.send("⚠️ I couldn't generate a response.", ephemeral=True)
            return

        # Update conversation history
        conversation_history.append({"role": "user", "content": user_message_parts})
        conversation_history.append({"role": "assistant", "content": reply})

    except Exception as e:
        handle_exception(e, f"Unexpected error in 'Analyze with ChatGPT' command by {ctx.author.username} ({ctx.author.id})")
        await ctx.send("⚠️ An unexpected error occurred.", ephemeral=True)

# -------------------------
# Bot Startup
# -------------------------
try:
    bot.start(TOKEN)
except Exception as e:
    handle_exception(e, "Exception occurred during bot startup")
    sys.exit(1)
