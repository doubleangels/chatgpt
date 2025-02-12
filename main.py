import asyncio
import html.parser
import logging
import os
import random
import re
import signal
import sys
from collections import defaultdict, deque

import aiohttp
import async_timeout
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
    raise SystemExit(1)

TOKEN = required_env_vars["DISCORD_BOT_TOKEN"]
OPENAI_API_KEY = required_env_vars["OPENAI_API_KEY"]

# -------------------------
# OpenAI Configuration
# -------------------------
openai.api_key = OPENAI_API_KEY
MODEL_NAME = "gpt-4o-mini"

# Limit how many concurrent OpenAI calls can happen at once:
OPENAI_MAX_CONCURRENT = 3
openai_semaphore = asyncio.Semaphore(OPENAI_MAX_CONCURRENT)

# -------------------------
# Per-User Conversation Histories
# -------------------------
user_channel_history = defaultdict(lambda: deque(maxlen=10))

# -------------------------
# Discord Bot Setup
# -------------------------
bot = interactions.Client(token=TOKEN, sync_commands=True)

# -------------------------
# Global aiohttp Session
# -------------------------
session: aiohttp.ClientSession | None = None

async def create_http_session():
    """Create a global aiohttp session if not already created."""
    global session
    if session is None:
        session = aiohttp.ClientSession()
        logger.info("Global aiohttp session created.")

async def close_http_session():
    """Close the global aiohttp session."""
    global session
    if session is not None:
        await session.close()
        session = None
        logger.info("Global aiohttp session closed.")

# -------------------------
# Graceful Shutdown Handling
# -------------------------
def handle_interrupt(signal_num, frame):
    """
    Handle SIGINT/SIGTERM: schedule a graceful shutdown.
    """
    logger.info("Received shutdown signal, scheduling graceful shutdown.")
    loop = asyncio.get_event_loop()
    loop.create_task(shutdown())

async def shutdown():
    """
    Coroutine to shut down the bot and close resources.
    """
    logger.info("Shutting down the bot...")
    await close_http_session()       # Close HTTP session
    await bot._http.close()          # Cleanly stop interactions.py internal HTTP
    logger.info("Bot shutdown complete. Exiting.")
    sys.exit(0)

signal.signal(signal.SIGINT, handle_interrupt)
signal.signal(signal.SIGTERM, handle_interrupt)

# -------------------------
# Retry Logic: OpenAI Calls
# -------------------------
import openai.error

async def openai_call_with_retries(payload, retries=3, base_delay=2):
    """
    Calls the OpenAI API with retry logic, handling RateLimitError specifically.
    Exponential backoff with jitter for rate-limits.
    """
    for attempt in range(retries):
        try:
            response = openai.chat.completions.create(**payload)
            return response
        except openai.error.RateLimitError as e:
            if attempt == retries - 1:
                logger.error("Max retries reached for RateLimitError, re-raising.")
                raise
            wait_time = base_delay * (2 ** attempt) + random.uniform(0, 1)
            logger.warning(
                f"Rate-limited by OpenAI (attempt {attempt+1}/{retries}), "
                f"retrying in {wait_time:.1f}s..."
            )
            await asyncio.sleep(wait_time)
        except openai.error.OpenAIError as e:
            # Could be APIError, ServiceUnavailableError, etc.
            if attempt == retries - 1:
                logger.error("Max retries reached for OpenAIError, re-raising.")
                raise
            wait_time = base_delay * (2 ** attempt)
            logger.warning(
                f"OpenAIError (attempt {attempt+1}/{retries}): {e}. Retrying in {wait_time}s..."
            )
            await asyncio.sleep(wait_time)
        except Exception as e:
            # Generic exception - optionally handle differently
            if attempt == retries - 1:
                logger.error("Max retries reached for unknown error, re-raising.")
                raise
            wait_time = base_delay
            logger.warning(f"Exception: {e} - retrying in {wait_time}s...")
            await asyncio.sleep(wait_time)
    return None  # Should not reach here if we always raise at the last attempt

# -------------------------
# Retry Logic: HTTP Fetches (Tenor/Giphy)
# -------------------------
async def fetch_url_with_retries(url, retries=3, base_delay=2):
    """
    Attempts to fetch the given URL up to `retries` times with exponential backoff on failure.
    Returns the text content if successful, or None after all retries fail.
    """
    global session
    if session is None:
        await create_http_session()

    for attempt in range(retries):
        try:
            async with async_timeout.timeout(10):
                async with session.get(url) as response:
                    if response.status == 200:
                        return await response.text()
                    else:
                        raise ValueError(
                            f"Non-OK status {response.status} for URL {url}"
                        )
        except (asyncio.TimeoutError, aiohttp.ClientError, ValueError) as e:
            if attempt == retries - 1:
                logger.error(f"Fetch max retries reached. Last error: {e}")
                return None
            wait_time = base_delay * (2 ** attempt) + random.uniform(0, 1)
            logger.warning(
                f"Failed to fetch URL {url} (attempt {attempt+1}/{retries}): {e}. "
                f"Retrying in {wait_time:.1f}s..."
            )
            await asyncio.sleep(wait_time)
        except Exception as e:
            if attempt == retries - 1:
                logger.error(f"Unexpected error after max retries: {e}")
                return None
            wait_time = base_delay
            logger.warning(f"Exception: {e} - retrying in {wait_time}s...")
            await asyncio.sleep(wait_time)
    return None

# -------------------------
# Helper Function: Generate AI Response
# -------------------------
async def generate_ai_response(conversation: list, channel) -> str:
    """
    Sends the conversation payload to OpenAI and returns the reply.
    Logs both the input and output for debugging.
    Enforces concurrency limit with a semaphore.
    Incorporates the openai_call_with_retries function.
    """
    async with openai_semaphore:
        payload = {
            "model": MODEL_NAME,
            "messages": conversation,
            "max_tokens": 500,
            "temperature": 0.7,
        }
        try:
            logger.debug(f"Sending conversation payload to OpenAI: {conversation}")

            response = await openai_call_with_retries(payload, retries=3, base_delay=2)
            if not response or not response.choices:
                logger.warning("OpenAI API returned no valid choices.")
                return ""

            reply = response.choices[0].message.content
            logger.debug(f"Final reply from OpenAI: {reply}")
            return reply

        except Exception as e:
            logger.exception(f"Exception during AI response generation: {e}")
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
    """
    Fetches the page at `url` with retry logic, then extracts the direct GIF URL from the OG metadata.
    Returns the direct GIF URL if found, or None otherwise.
    """
    # We'll fetch the HTML with our retry function:
    html_text = await fetch_url_with_retries(url, retries=3, base_delay=2)
    if not html_text:
        logger.warning(f"Giving up on fetching URL {url} after retries.")
        return None

    # Extract the og:image URL from the HTML
    direct_url = extract_og_image(html_text)
    if direct_url:
        logger.debug(f"Extracted direct GIF URL {direct_url} from {url}")
    else:
        logger.warning(f"No OG image found for URL {url}")

    return direct_url

# -------------------------
# Event Listeners
# -------------------------
@interactions.listen()
async def on_ready():
    """Triggered when the bot successfully connects to Discord."""
    await create_http_session()
    await bot.change_presence(
        status=interactions.Status.ONLINE,
        activity=interactions.Activity(
            name="for pings! 📡",
            type=interactions.ActivityType.WATCHING
        )
    )
    logger.info("I am online and ready!")

@interactions.listen()
async def on_message_create(event: interactions.api.events.MessageCreate):
    """
    Handles incoming messages:
      - Ignores the bot's own messages.
      - Responds with GPT if:
          * the bot is mentioned,
          * an image is attached, or
          * the user is replying to one of the bot's messages.
      - Maintains per-user conversation history in each channel.
      - Logs user prompts.
    """
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
                logger.exception(
                    f"Failed to fetch referenced message in channel {channel_id}. "
                    f"Possible permissions issue: {e}"
                )

        # Ignore the bot's own messages
        if user_id == bot.user.id:
            return

        # Only handle the message if:
        #   - The bot is mentioned
        #   - The message has image attachments
        #   - The message is a reply to a bot's message
        if bot_mention not in message.content and not message.attachments and not is_reply_to_bot:
            return
        else:
            if bot_mention in message.content:
                message.channel.trigger_typing()

        logger.debug(f"Bot triggered by message {message.id} in channel {channel_id}.")

        # Prepare user content
        user_text = message.content.replace(bot_mention, "@ChatGPT")
        logger.debug(
            f"User '{message.author.username}' (ID: {user_id}) in channel {channel_id}: {user_text}"
        )

        # Build user's content parts
        image_urls = [
            attachment.url
            for attachment in message.attachments
            if attachment.content_type and attachment.content_type.startswith("image/")
        ]
        user_message_parts = [{"type": "text", "text": user_text}]
        for url in image_urls:
            user_message_parts.append({"type": "image_url", "image_url": {"url": url}})

        # Retrieve and build the conversation history for this user in this channel
        key = (channel_id, user_id)
        conversation_deque = user_channel_history[key]
        conversation = list(conversation_deque)

        # If no system message yet, add it
        if not conversation or conversation[0].get("role") != "system":
            conversation.insert(
                0,
                {
                    "role": "system",
                    "content": (
                        "You are a helpful assistant that can analyze text, images, etc. "
                        "Maintain conversation continuity and context."
                    ),
                },
            )

        # Optionally include the referenced bot message if the user is replying to the bot
        if is_reply_to_bot and referenced_message:
            conversation.append({"role": "assistant", "content": referenced_message.content})

        # Append the new user message
        conversation.append({"role": "user", "content": user_message_parts})

        # Generate AI response
        reply = await generate_ai_response(conversation, message.channel)
        if not reply:
            await message.channel.send("⚠️ I couldn't generate a response.", reply_to=message.id)
            return

        # Send the reply in chunks if it's too long
        for i in range(0, len(reply), 2000):
            await message.channel.send(reply[i : i + 2000], reply_to=message.id)

        # Update conversation history in the deque
        conversation_deque.append({"role": "user", "content": user_message_parts})
        conversation_deque.append({"role": "assistant", "content": reply})

    except Exception as e:
        logger.exception(f"Unexpected error in on_message_create: {e}")

# -------------------------
# Slash Commands
# -------------------------
@interactions.slash_command(name="reset", description="Reset all per-user conversation history globally.")
async def reset(ctx: interactions.ComponentContext):
    """
    Resets *all* per-user conversation histories in every channel.
    Only admins can use this command.
    """
    if not ctx.author.has_permission(interactions.Permissions.ADMINISTRATOR):
        logger.warning(f"Unauthorized /reset attempt by {ctx.author.username} ({ctx.author.id})")
        await ctx.send("❌ You do not have permission to use this command.", ephemeral=True)
        return

    try:
        user_channel_history.clear()
        logger.info(f"Conversation histories reset by {ctx.author.username} ({ctx.author.id})")
        await ctx.send("🗑️ **All per-user conversation histories have been reset.**", ephemeral=True)
    except Exception as e:
        logger.exception(f"Error in /reset command: {e}")
        await ctx.send("⚠️ An error occurred while resetting.", ephemeral=True)

# -------------------------
# Context Menu Command
# -------------------------
@interactions.message_context_menu(name="Analyze with ChatGPT")
async def analyze_message(ctx: interactions.ContextMenuContext):
    """
    Allows users to right-click a message -> 'Apps' -> 'Analyze with ChatGPT'.
    Uses per-user conversation history for the user who invoked the context menu.
    Includes retry logic for GIF URLs (Tenor/Giphy).
    """
    try:
        message: interactions.Message = ctx.target  # The selected message
        if not message:
            await ctx.send("❌ Could not retrieve the message.", ephemeral=True)
            return

        channel_id = message.channel.id
        user_id = ctx.author.id  # The user who invoked the context menu

        logger.debug(
            f"User '{ctx.author.username}' (ID: {ctx.author.id}) requested analysis "
            f"for message {message.id} in channel {channel_id}"
        )

        # Extract text from the target message
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

        # Check for Tenor/Giphy URLs
        tenor_giphy_pattern = r"(https?://(?:tenor\.com|giphy\.com)/\S+)"
        urls = re.findall(tenor_giphy_pattern, message_text)
        # Run all fetches concurrently
        tasks = [fetch_direct_gif(u) for u in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for url, direct_url in zip(urls, results):
            if isinstance(direct_url, Exception):
                logger.exception(f"Failed to fetch GIF from {url}: {direct_url}")
                continue
            if direct_url:
                attachment_parts.append({"type": "image_url", "image_url": {"url": direct_url}})
                logger.debug(f"Added direct GIF URL {direct_url} from {url}")

        user_message_parts = [{"type": "text", "text": message_text}]
        user_message_parts.extend(attachment_parts)

        # Retrieve or create per-user conversation history in this channel
        key = (channel_id, user_id)
        conversation_deque = user_channel_history[key]
        conversation = list(conversation_deque)

        # Insert system message if none
        if not conversation or conversation[0].get("role") != "system":
            conversation.insert(
                0,
                {
                    "role": "system",
                    "content": (
                        "You are a helpful assistant that can analyze text, images, videos, and GIFs. "
                        "Maintain conversation continuity and context."
                    ),
                },
            )

        # Append user's new analysis request
        conversation.append({"role": "user", "content": user_message_parts})

        # Defer to allow processing time
        await ctx.defer()

        # Generate the AI response
        reply = await generate_ai_response(conversation, ctx.channel)
        if not reply:
            await ctx.send("⚠️ I couldn't generate a response.", ephemeral=True)
            return

        # Send the reply in chunks if too long
        for i in range(0, len(reply), 2000):
            await ctx.send(reply[i : i + 2000])

        # Update conversation history
        conversation_deque.append({"role": "user", "content": user_message_parts})
        conversation_deque.append({"role": "assistant", "content": reply})

    except Exception as e:
        logger.exception(f"Unexpected error in 'Analyze with ChatGPT' command: {e}")
        await ctx.send("⚠️ An unexpected error occurred.", ephemeral=True)

# -------------------------
# Bot Startup
# -------------------------
if __name__ == "__main__":
    try:
        bot.start(TOKEN)
    except Exception:
        logger.error("Exception occurred during bot startup!", exc_info=True)
        sys.exit(1)
