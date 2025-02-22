import asyncio
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
# Global Performance Optimizations
# -------------------------
# Precompile regex for Tenor/Giphy URLs to avoid recompiling on each message
TENOR_GIPHY_PATTERN = re.compile(r"(https?://(?:tenor\.com|giphy\.com)/\S+)")
# Global aiohttp session (will be initialized on startup)
aiohttp_session = None

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

# Set up the logging format and handler
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
    """
    Logs an exception with context and reports it to Sentry.

    Args:
        e (Exception): The exception that occurred.
        context (str): Additional context about where the exception occurred.
    """
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
# Use a deque to maintain a fixed-length conversation history per channel
channel_message_history = defaultdict(lambda: deque(maxlen=10))

# -------------------------
# Discord Bot Setup
# -------------------------
bot = interactions.Client(token=TOKEN, sync_commands=True)

# -------------------------
# Graceful Shutdown Handling
# -------------------------
async def shutdown(loop, sig=None):
    """
    Cancels outstanding tasks, closes the aiohttp session, flushes Sentry,
    and logs the shutdown.
    
    Args:
        loop: The current event loop.
        sig: Optional signal that triggered the shutdown.
    """
    if sig:
        logger.info(f"Received exit signal {sig.name}. Initiating shutdown...")
    logger.info("Cancelling outstanding tasks")
    tasks = [task for task in asyncio.all_tasks(loop) if task is not asyncio.current_task(loop)]
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    global aiohttp_session
    if aiohttp_session:
        await aiohttp_session.close()
    logger.info("Flushing Sentry events...")
    sentry_sdk.flush(timeout=2)
    logger.info("Shutdown complete.")

def handle_interrupt(sig, frame):
    """
    Synchronous signal handler that schedules the asynchronous shutdown.
    
    Args:
        sig: The signal received.
        frame: The current stack frame.
    """
    loop = asyncio.get_event_loop()
    loop.create_task(shutdown(loop, sig))

signal.signal(signal.SIGINT, handle_interrupt)
signal.signal(signal.SIGTERM, handle_interrupt)

# -------------------------
# Helper Function: Split Long Message
# -------------------------
def split_message(text: str, limit: int = 2000) -> list:
    """
    Splits the given text into chunks not exceeding the character limit.
    Attempts to split at newline boundaries for better readability.

    Args:
        text (str): The full text to split.
        limit (int): Maximum allowed characters per chunk (default 2000).

    Returns:
        list: A list of text chunks.
    """
    if len(text) <= limit:
        return [text]
    # Split by newline and build chunks
    lines = text.split("\n")
    chunks = []
    current_chunk = ""
    for line in lines:
        if len(current_chunk) + len(line) + 1 > limit:
            if current_chunk:
                chunks.append(current_chunk)
                current_chunk = line
            else:
                while len(line) > limit:
                    chunks.append(line[:limit])
                    line = line[limit:]
                current_chunk = line
        else:
            current_chunk = f"{current_chunk}\n{line}" if current_chunk else line
    if current_chunk:
        chunks.append(current_chunk)
    return chunks

# -------------------------
# Helper Function: Typing Indicator
# -------------------------
async def typing_indicator(channel, interval=9):
    """
    Continuously triggers the typing indicator on a channel every 'interval' seconds.

    Args:
        channel: The Discord channel to trigger typing on.
        interval (int): Number of seconds between each trigger.
    """
    try:
        while True:
            await channel.trigger_typing()
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        pass

# -------------------------
# Helper Function: Generate AI Response
# -------------------------
async def generate_ai_response(conversation: list, channel) -> str:
    """
    Sends the conversation payload to OpenAI and returns the generated response.

    Args:
        conversation (list): The conversation history as a list of message dictionaries.
        channel: The Discord channel object (used for logging).

    Returns:
        str: The AI-generated reply, or an empty string if generation fails.
    """
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
    """
    Custom HTMLParser to extract the 'og:image' meta tag from HTML.
    """
    def __init__(self):
        super().__init__()
        self.og_image = None

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "meta":
            attr_dict = dict(attrs)
            if attr_dict.get("property") == "og:image" and "content" in attr_dict:
                self.og_image = attr_dict["content"]

def extract_og_image(html_text: str) -> str:
    """
    Extracts the og:image URL from provided HTML text.
    
    Args:
        html_text (str): The HTML content as a string.
    
    Returns:
        str: The URL found in the og:image meta tag, or None if not found.
    """
    parser = OGImageParser()
    parser.feed(html_text)
    if parser.og_image:
        logger.debug(f"Extracted OG image URL: {parser.og_image}")
    else:
        logger.warning("No og:image meta tag found in the HTML.")
    return parser.og_image

async def fetch_direct_gif(url: str) -> str:
    """
    Fetches the HTML content from a URL and extracts the direct GIF URL from the og:image meta tag.

    Args:
        url (str): The URL to fetch.
    
    Returns:
        str: The direct GIF URL extracted from the HTML, or None if not found.
    """
    global aiohttp_session
    try:
        async with aiohttp_session.get(url) as response:
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
    """
    Event handler called when the bot becomes ready.
    Initializes the aiohttp session and sets the bot's presence.
    """
    global aiohttp_session
    if aiohttp_session is None:
        aiohttp_session = aiohttp.ClientSession()
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
    """
    Event handler for new messages. Processes messages that trigger the bot.

    Args:
        event: The MessageCreate event from interactions.
    """
    try:
        message = event.message
        if not message:
            return

        channel_name = getattr(message.channel, "name", f"Channel {message.channel.id}")
        bot_mention = f"<@{bot.user.id}>"

        is_reply_to_bot = False
        referenced_message = None
        if message.message_reference and message.message_reference.message_id:
            try:
                referenced_message = await message.channel.fetch_message(
                    message.message_reference.message_id
                )
                is_reply_to_bot = (referenced_message and referenced_message.author.id == bot.user.id)
            except Exception as e:
                handle_exception(e, f"Failed to fetch referenced message in channel {channel_name}")

        if message.author.id == bot.user.id:
            return

        if bot_mention not in message.content and not message.attachments and not is_reply_to_bot:
            return

        await message.channel.trigger_typing()
        logger.debug(f"Bot triggered by message {message.id} in channel {channel_name}")

        user_text = message.content.replace(bot_mention, "@ChatGPT")
        logger.debug(f"User '{message.author.username}' in channel {channel_name}: {user_text}")

        image_urls = [
            attachment.url
            for attachment in message.attachments
            if attachment.content_type and attachment.content_type.startswith("image/")
        ]

        user_message_parts = [{"type": "text", "text": user_text}]
        for url in image_urls:
            user_message_parts.append({"type": "image_url", "image_url": {"url": url}})

        conversation_history = channel_message_history[message.channel.id]
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

        if is_reply_to_bot and referenced_message:
            conversation.append({"role": "assistant", "content": referenced_message.content})

        conversation.append({"role": "user", "content": user_message_parts})

        typing_task = asyncio.create_task(typing_indicator(message.channel))
        try:
            reply = await generate_ai_response(conversation, message.channel)
        finally:
            typing_task.cancel()
            try:
                await typing_task
            except asyncio.CancelledError:
                pass

        if not reply:
            await message.channel.send("⚠️ I couldn't generate a response.", reply_to=message.id)
            return

        chunks = split_message(reply)
        for i, chunk in enumerate(chunks):
            if i == 0:
                await message.channel.send(chunk, reply_to=message.id)
            else:
                await message.channel.send(chunk)

        conversation_history.append({"role": "user", "content": user_message_parts})
        conversation_history.append({"role": "assistant", "content": reply})

    except Exception as e:
        channel_name = getattr(message.channel, "name", "Unknown Channel") if message else "Unknown Channel"
        handle_exception(e, f"Unexpected error in on_message_create (Channel: {channel_name})")

# -------------------------
# Slash Commands
# -------------------------
@interactions.slash_command(name="reset", description="Reset the entire conversation history.")
async def reset(ctx: interactions.ComponentContext):
    """
    Slash command to reset the conversation history.

    Args:
        ctx: The context of the slash command.
    """
    try:
        if not ctx.author.has_permission(interactions.Permissions.ADMINISTRATOR):
            logger.warning(f"Unauthorized /reset attempt by {ctx.author.username}")
            await ctx.send("❌ You do not have permission to use this command.", ephemeral=True)
            return

        channel_message_history.clear()
        logger.info(f"Conversation history reset by {ctx.author.username}")
        await ctx.send("🗑️ **Global conversation history has been reset.**", ephemeral=True)
    except Exception as e:
        handle_exception(e, f"Error in /reset command by {ctx.author.username}")
        await ctx.send("⚠️ An error occurred while resetting the conversation history.", ephemeral=True)

# -------------------------
# Context Menu Command
# -------------------------
@interactions.message_context_menu(name="Analyze with ChatGPT")
async def analyze_message(ctx: interactions.ContextMenuContext):
    """
    Context menu command to analyze a selected message with ChatGPT.

    Args:
        ctx: The context of the command.
    """
    try:
        message: interactions.Message = ctx.target
        if not message:
            await ctx.send("❌ Could not retrieve the message.", ephemeral=True)
            return

        channel_name = getattr(message.channel, "name", f"Channel {message.channel.id}")
        logger.debug(f"User '{ctx.author.username}' requested analysis for message {message.id} in channel {channel_name}")

        message_text = message.content or "📜 No text found in message."

        attachment_parts = []
        for attachment in message.attachments:
            if not attachment.content_type:
                continue
            if attachment.content_type.startswith("image/"):
                attachment_parts.append({"type": "image_url", "image_url": {"url": attachment.url}})
            elif attachment.content_type.startswith("video/"):
                attachment_parts.append({"type": "video_url", "video_url": {"url": attachment.url}})

        for url in TENOR_GIPHY_PATTERN.findall(message_text):
            direct_url = await fetch_direct_gif(url)
            if direct_url:
                attachment_parts.append({"type": "image_url", "image_url": {"url": direct_url}})
                logger.debug(f"Added direct GIF URL {direct_url} from {url}")

        user_message_parts = [{"type": "text", "text": message_text}]
        user_message_parts.extend(attachment_parts)

        conversation_history = channel_message_history[message.channel.id]
        conversation = list(conversation_history)

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

        conversation.append({"role": "user", "content": user_message_parts})

        await ctx.defer()

        typing_task = asyncio.create_task(typing_indicator(ctx.channel))
        try:
            reply = await generate_ai_response(conversation, ctx.channel)
        finally:
            typing_task.cancel()
            try:
                await typing_task
            except asyncio.CancelledError:
                pass

        if not reply:
            await ctx.send("⚠️ I couldn't generate a response.", ephemeral=True)
            return

        chunks = split_message(reply)
        for i, chunk in enumerate(chunks):
            if i == 0:
                await ctx.send(chunk, reply_to=message.id)
            else:
                await ctx.send(chunk)

        conversation_history.append({"role": "user", "content": user_message_parts})
        conversation_history.append({"role": "assistant", "content": reply})

    except Exception as e:
        handle_exception(e, f"Unexpected error in 'Analyze with ChatGPT' command by {ctx.author.username}")
        await ctx.send("⚠️ An unexpected error occurred.", ephemeral=True)

# -------------------------
# Bot Startup and Shutdown
# -------------------------
async def main():
    try:
        logger.info("Starting the bot...")
        # Use the asynchronous start method to avoid nested event loop issues.
        await bot.astart(TOKEN)
    except Exception as e:
        handle_exception(e, "Exception occurred during bot startup")
    finally:
        await shutdown(asyncio.get_event_loop())

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt received. Exiting.")
    finally:
        logging.shutdown()
        sys.exit(0)
