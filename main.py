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
# Performance Optimization
# -------------------------
# Precompile regex for Tenor/Giphy URLs to avoid recompiling on each message
TENOR_GIPHY_PATTERN = re.compile(r"(https?://(?:tenor\.com|giphy\.com)/\S+)")
# Global aiohttp session (will be initialized on startup)
aiohttp_session = None

# -------------------------
# Discord Bot Setup
# -------------------------
bot = interactions.Client(
    token=TOKEN,
    sync_commands=True
)

# -------------------------
# Graceful Shutdown Handling
# -------------------------
def handle_interrupt(signal_num, frame):
    """
    ! HANDLE SHUTDOWN SIGNALS AND GRACEFULLY CLOSE RESOURCES
    * Handles shutdown signals and gracefully closes resources.
    ? PARAMETERS:
    ? signal_num - The signal number.
    ? frame      - The current stack frame.
    """
    logger.info("Shutdown signal received. Cleaning up and shutting down gracefully.")
    sys.exit(0)

# Register the signal handlers for graceful shutdown.
signal.signal(signal.SIGINT, handle_interrupt)
signal.signal(signal.SIGTERM, handle_interrupt)

# -------------------------
# Miscellaneous Helpers
# -------------------------
def split_message(text: str, limit: int = 2000) -> list:
    """
    ! SPLIT TEXT INTO CHUNKS NOT EXCEEDING THE CHARACTER LIMIT
    * Splits the provided text into chunks that do not exceed the specified character limit.
    * Attempts to split at newline boundaries for improved readability.
    ? PARAMETERS:
    ? text  - The full text to split.
    ? limit - Maximum allowed characters per chunk (default 2000).
    ? RETURNS:
    * A list of text chunks.
    """
    # Log the start of the split_message function.
    logger.debug(f"Splitting text of length {len(text)} with limit {limit}.")
    if len(text) <= limit:
        logger.debug("Text within limit; returning original text as a single chunk.")
        return [text]
    # Split text by newline to build chunks that respect line boundaries.
    lines = text.split("\n")
    chunks = []
    current_chunk = ""
    for line in lines:
        # If adding the next line exceeds the limit, save the current chunk and start a new one.
        if len(current_chunk) + len(line) + 1 > limit:
            if current_chunk:
                chunks.append(current_chunk)
                logger.debug(f"Appended chunk of length {len(current_chunk)}.")
                current_chunk = line
            else:
                # If current_chunk is empty, break the long line into pieces.
                while len(line) > limit:
                    chunks.append(line[:limit])
                    logger.debug(f"Appended split chunk of length {limit} from a long line.")
                    line = line[limit:]
                current_chunk = line
        else:
            # Append the line to the current chunk with a newline if necessary.
            current_chunk = f"{current_chunk}\n{line}" if current_chunk else line
    if current_chunk:
        chunks.append(current_chunk)
        logger.debug(f"Appended final chunk of length {len(current_chunk)}.")
    logger.debug(f"Total chunks created: {len(chunks)}.")
    return chunks

async def typing_indicator(channel, interval=9):
    """
    ! CONTINUOUSLY TRIGGERS THE TYPING INDICATOR ON A CHANNEL EVERY 'INTERVAL' SECONDS
    * Continuously sends typing indicators on the specified channel at the given interval.
    ? PARAMETERS:
    ? channel  - The Discord channel to trigger typing on.
    ? interval - Number of seconds between each trigger.
    """
    logger.debug(f"Starting typing indicator with interval {interval} seconds.")
    try:
        while True:
            # Trigger the typing indicator and wait for the next interval.
            await channel.trigger_typing()
            logger.debug("Triggered typing indicator.")
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        logger.debug("Typing indicator task cancelled.")
        pass

async def generate_ai_response(conversation: list, channel) -> str:
    """
    ! SENDS THE CONVERSATION PAYLOAD TO OPENAI AND RETURNS THE GENERATED RESPONSE
    * Sends the conversation payload to OpenAI and returns the AI-generated reply.
    ? PARAMETERS:
    ? conversation - The conversation history as a list of message dictionaries.
    ? channel      - The Discord channel object (used for logging).
    ? RETURNS:
    * A string representing the AI-generated reply, or an empty string if generation fails.
    """
    logger.debug(f"Preparing to send conversation payload to OpenAI. Conversation length: {len(conversation)}")
    try:
        response = openai.chat.completions.create(
            model=MODEL_NAME,
            messages=conversation,
            max_tokens=500,
            temperature=0.7,
        )
        logger.debug(f"Received response from OpenAI.")
        if not response.choices:
            logger.warning("OpenAI API returned no choices.")
            return ""
        reply = response.choices[0].message.content
        logger.debug(f"Final reply from OpenAI obtained.")
        return reply
    except Exception as e:
        logger.error(f"Error generating AI response: {e}", exc_info=True)
        return ""

import html.parser
import logging
from typing import Optional
import aiohttp

# Set up a logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.DEBUG)

# Create a global aiohttp session (ensure proper cleanup in your application)
aiohttp_session = aiohttp.ClientSession()

class OGImageParser(html.parser.HTMLParser):
    """
    ! CUSTOM HTMLPARSER FOR 'OG:IMAGE'
    * Custom HTMLParser to extract the 'og:image' meta tag from HTML.
    """
    def __init__(self):
        super().__init__()
        self.og_image: Optional[str] = None

    def handle_starttag(self, tag, attrs):
        # Check for meta tags and extract og:image property if present.
        if tag.lower() == "meta":
            attr_dict = dict(attrs)
            if attr_dict.get("property") == "og:image" and "content" in attr_dict:
                self.og_image = attr_dict["content"]
                logger.debug(f"Found og:image with content: {self.og_image}")

def extract_og_image(html_text: str) -> Optional[str]:
    """
    ! EXTRACTS THE OG:IMAGE URL FROM PROVIDED HTML TEXT
    * Extracts the URL found in the 'og:image' meta tag from the provided HTML content.
    ? PARAMETERS:
    ? html_text - The HTML content as a string.
    ? RETURNS:
    * The URL found in the og:image meta tag, or None if not found.
    """
    logger.debug("Starting extraction of og:image URL.")
    parser = OGImageParser()
    parser.feed(html_text)
    parser.close()  # Ensure the parser is closed after use
    if parser.og_image:
        logger.debug(f"Successfully extracted og:image URL: {parser.og_image}")
    else:
        logger.warning("No og:image meta tag found in the HTML.")
    return parser.og_image

async def fetch_direct_gif(url: str) -> Optional[str]:
    """
    ! FETCHES THE HTML CONTENT FROM A URL AND EXTRACTS THE DIRECT GIF URL FROM THE OG:IMAGE META TAG
    * Fetches the HTML content from the provided URL, then extracts and returns the direct GIF URL 
    * found in the 'og:image' meta tag.
    ? PARAMETERS:
    ? url - The URL to fetch.
    ? RETURNS:
    * The direct GIF URL extracted from the HTML, or None if not found.
    """
    logger.debug(f"Initiating fetch for URL: {url}")
    try:
        async with aiohttp_session.get(url) as response:
            if response.status != 200:
                logger.warning(f"Failed to retrieve URL {url} (status {response.status}).")
                return None
            html_text = await response.text()
            logger.debug(f"Successfully retrieved HTML content from {url}")
    except Exception as e:
        logger.error(f"Error fetching URL {url}: {e}", exc_info=True)
        return None

    try:
        direct_url = extract_og_image(html_text)
        if direct_url:
            logger.debug(f"Extracted direct GIF URL: {direct_url}")
        else:
            logger.warning(f"No OG image found for URL {url}")
        return direct_url
    except Exception as e:
        logger.error(f"Error extracting direct GIF URL: {e}", exc_info=True)
        return None

# -------------------------
# Event Listeners
# -------------------------
@interactions.listen()
async def on_ready():
    """
    ! EVENT HANDLER CALLED WHEN THE BOT BECOMES READY
    * Initializes the aiohttp session and sets the bot's presence.
    """
    global aiohttp_session
    # Initialize the global aiohttp session if it hasn't been created yet.
    if aiohttp_session is None:
        aiohttp_session = aiohttp.ClientSession()
        logger.debug("Initialized global aiohttp session.")
    try:
        # Set the bot's presence with online status and a custom activity.
        await bot.change_presence(
            status=interactions.Status.ONLINE,
            activity=interactions.Activity(
                name="for pings! 📡",
                type=interactions.ActivityType.WATCHING
            )
        )
        logger.info("Bot is online and ready!")
    except Exception as e:
        logger.error(f"Error setting bot presence: {e}", exc_info=True)

@interactions.listen()
async def on_message_create(event: interactions.api.events.MessageCreate):
    """
    ! EVENT HANDLER FOR NEW MESSAGES THAT TRIGGER THE BOT
    * Processes messages that trigger the bot.
    ? PARAMETERS:
    ? event - The MessageCreate event from interactions.
    """
    try:
        message = event.message
        if not message:
            return

        # Retrieve the channel name or fallback to channel ID.
        channel_name = getattr(message.channel, "name", f"Channel {message.channel.id}")
        bot_mention = f"<@{bot.user.id}>"

        # Check if the message is a reply to a bot message.
        is_reply_to_bot = False
        referenced_message = None
        if message.message_reference and message.message_reference.message_id:
            try:
                referenced_message = await message.channel.fetch_message(
                    message.message_reference.message_id
                )
                is_reply_to_bot = (referenced_message and referenced_message.author.id == bot.user.id)
            except Exception as e:
                logger.error(f"Error fetching referenced message: {e}", exc_info=True)

        # Ignore messages sent by the bot itself.
        if message.author.id == bot.user.id:
            return

        # Only proceed if the message mentions the bot, has attachments, or is a reply to the bot.
        if bot_mention not in message.content and not message.attachments and not is_reply_to_bot:
            return

        # Trigger the typing indicator for user feedback.
        await message.channel.trigger_typing()
        logger.debug(f"Message {message.id} in {channel_name} triggered the bot.")

        # Replace bot mention with a placeholder for AI processing.
        user_text = message.content.replace(bot_mention, "@ChatGPT")
        logger.debug(f"Processed message from {message.author.username} in {channel_name}: {user_text}")

        # Collect image URLs from message attachments (only images).
        image_urls = [
            attachment.url
            for attachment in message.attachments
            if attachment.content_type and attachment.content_type.startswith("image/")
        ]

        # Create a list of user message parts containing text and any image URLs.
        user_message_parts = [{"type": "text", "text": user_text}]
        for url in image_urls:
            user_message_parts.append({"type": "image_url", "image_url": {"url": url}})

        # Retrieve conversation history for the channel.
        conversation_history = channel_message_history[message.channel.id]
        conversation = list(conversation_history)

        # Ensure a system prompt is present at the beginning of the conversation.
        if not conversation or conversation[0].get("role") != "system":
            conversation.insert(
                0,
                {
                    "role": "system",
                    "content": (
                        "You are a helpful assistant that can analyze text, images, videos, and GIFs. "
                        "Users know that you cannot send messages on their behalf. "
                        "Please send responses in a clear and concise manner, using Discord message formatting. "
                        "Limit responses to less than 2000 characters. "
                        "Maintain conversation continuity and context."
                    ),
                },
            )

        # If the message is a reply to a bot message, add that to the conversation.
        if is_reply_to_bot and referenced_message:
            conversation.append({"role": "assistant", "content": referenced_message.content})

        # Append the current user message to the conversation.
        conversation.append({"role": "user", "content": user_message_parts})

        # Start the typing indicator task.
        typing_task = asyncio.create_task(typing_indicator(message.channel))
        try:
            # Generate the AI response based on the conversation history.
            reply = await generate_ai_response(conversation, message.channel)
        finally:
            # Cancel the typing indicator task once the response is ready.
            typing_task.cancel()
            try:
                await typing_task
            except asyncio.CancelledError:
                pass

        # If no reply was generated, inform the user.
        if not reply:
            await message.channel.send("⚠️ I couldn't generate a response.", reply_to=message.id)
            return

        # Split the reply into chunks if it exceeds Discord's character limit and send each chunk.
        chunks = split_message(reply)
        for i, chunk in enumerate(chunks):
            if i == 0:
                await message.channel.send(chunk, reply_to=message.id)
            else:
                await message.channel.send(chunk)

        # Update conversation history with the new messages.
        conversation_history.append({"role": "user", "content": user_message_parts})
        conversation_history.append({"role": "assistant", "content": reply})

    except Exception as e:
        channel_name = getattr(message.channel, "name", "Unknown Channel") if message else "Unknown Channel"
        logger.error(f"Error processing message in {channel_name}: {e}", exc_info=True)

# -------------------------
# Slash Commands
# -------------------------
@interactions.slash_command(name="reset", description="Reset the entire conversation history.")
async def reset(ctx: interactions.ComponentContext):
    """
    ! SLASH COMMAND TO RESET THE CONVERSATION HISTORY
    * Completely clears the global conversation history.
    ? PARAMETERS:
    ? ctx - The context of the slash command.
    """
    try:
        # Check if the user has administrator permissions before proceeding.
        if not ctx.author.has_permission(interactions.Permissions.ADMINISTRATOR):
            logger.warning(f"/reset command unauthorized attempt by {ctx.author.username}")
            await ctx.send("❌ You do not have permission to use this command.", ephemeral=True)
            return

        # Clear the global conversation history.
        channel_message_history.clear()
        logger.info(f"Conversation history successfully reset by {ctx.author.username}")
        await ctx.send("🗑️ **Global conversation history has been reset.**", ephemeral=True)
    except Exception as e:
        # Log the error with context and inform the user.
        logger.error(f"Error in /reset command: {e}", exc_info=True)
        await ctx.send("⚠️ An error occurred while resetting the conversation history.", ephemeral=True)

# -------------------------
# Context Menu Command
# -------------------------
@interactions.message_context_menu(name="Analyze with ChatGPT")
async def analyze_message(ctx: interactions.ContextMenuContext):
    """
    ! CONTEXT MENU COMMAND TO ANALYZE A SELECTED MESSAGE WITH CHATGPT
    * Uses ChatGPT to analyze the content of a selected message.
    ? PARAMETERS:
    ? ctx - The context of the command.
    """
    try:
        # Retrieve the target message from the context.
        message: interactions.Message = ctx.target
        if not message:
            await ctx.send("❌ Could not retrieve the message.", ephemeral=True)
            return

        # Get the channel name or fallback to the channel ID.
        channel_name = getattr(message.channel, "name", f"Channel {message.channel.id}")
        logger.debug(f"User '{ctx.author.username}' requested analysis for message {message.id} in {channel_name}")

        # Get the text content from the message, or use a default placeholder.
        message_text = message.content or "📜 No text found in message."

        # Build a list of attachment parts from the message attachments.
        attachment_parts = []
        for attachment in message.attachments:
            # Only process attachments that have a defined content type.
            if not attachment.content_type:
                continue
            # Append image URLs.
            if attachment.content_type.startswith("image/"):
                attachment_parts.append({"type": "image_url", "image_url": {"url": attachment.url}})
            # Append video URLs.
            elif attachment.content_type.startswith("video/"):
                attachment_parts.append({"type": "video_url", "video_url": {"url": attachment.url}})

        # Search for GIF URLs using a predefined pattern and fetch their direct URLs.
        for url in TENOR_GIPHY_PATTERN.findall(message_text):
            direct_url = await fetch_direct_gif(url)
            if direct_url:
                attachment_parts.append({"type": "image_url", "image_url": {"url": direct_url}})
                logger.debug(f"Added direct GIF URL {direct_url} from extracted URL {url}")

        # Combine the text and attachment parts into the user message payload.
        user_message_parts = [{"type": "text", "text": message_text}]
        user_message_parts.extend(attachment_parts)

        # Retrieve and clone the conversation history for the channel.
        conversation_history = channel_message_history[message.channel.id]
        conversation = list(conversation_history)

        # Ensure the conversation starts with a system prompt.
        if not conversation or conversation[0].get("role") != "system":
            conversation.insert(
                0,
                {
                    "role": "system",
                    "content": (
                        "You are a helpful assistant that can analyze text, images, videos, and GIFs. "
                        "Users understand that you cannot send messages on their behalf. "
                        "Respond clearly and concisely using Discord message formatting. "
                        "Limit your responses to less than 2000 characters while maintaining conversation context."
                    ),
                },
            )

        # Append the current user's message to the conversation.
        conversation.append({"role": "user", "content": user_message_parts})

        # Defer the response to allow for asynchronous processing.
        await ctx.defer()

        # Start a background typing indicator to signal that processing is in progress.
        typing_task = asyncio.create_task(typing_indicator(ctx.channel))
        try:
            # Generate the AI response using the current conversation.
            reply = await generate_ai_response(conversation, ctx.channel)
        finally:
            # Cancel the typing indicator once the response is generated.
            typing_task.cancel()
            try:
                await typing_task
            except asyncio.CancelledError:
                pass

        # If no reply was generated, notify the user.
        if not reply:
            await ctx.send("⚠️ I couldn't generate a response.", ephemeral=True)
            return

        # Split the AI reply into smaller chunks if necessary, then send each chunk.
        chunks = split_message(reply)
        for i, chunk in enumerate(chunks):
            if i == 0:
                await ctx.send(chunk, reply_to=message.id)
            else:
                await ctx.send(chunk)

        # Update the conversation history with the latest messages.
        conversation_history.append({"role": "user", "content": user_message_parts})
        conversation_history.append({"role": "assistant", "content": reply})

    except Exception as e:
        # Log any unexpected errors with context and inform the user.
        logger.error(f"Error in analyze_message: {e}", exc_info=True)
        await ctx.send("⚠️ An unexpected error occurred.", ephemeral=True)

# -------------------------
# Bot Startup
# -------------------------
try:
    bot.start(TOKEN)
except Exception as e:
    logger.error(f"Error starting the bot: {e}", exc_info=True)
    sys.exit(1)
