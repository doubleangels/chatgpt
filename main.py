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
    # Create a detailed error message
    message = f"{context} - Exception: {e}"
    logger.exception(message)  # Log the exception with traceback
    sentry_sdk.capture_exception(e)  # Report the exception to Sentry

# -------------------------
# Environment Variable Check
# -------------------------
required_env_vars = {
    "DISCORD_BOT_TOKEN": os.getenv("DISCORD_BOT_TOKEN"),
    "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY")
}

# Check if required environment variables are set
missing_vars = [key for key, value in required_env_vars.items() if not value]
if missing_vars:
    for var in missing_vars:
        logger.critical(f"{var} not found in environment variables.")
    sys.exit(1)

# Assign tokens from environment variables
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
# Using a deque to maintain a fixed-length history per channel
channel_message_history = defaultdict(lambda: deque(maxlen=10))

# -------------------------
# Discord Bot Setup
# -------------------------
bot = interactions.Client(token=TOKEN, sync_commands=True)

# -------------------------
# Graceful Shutdown Handling
# -------------------------
def handle_interrupt(signal_num, frame):
    """
    Handles shutdown signals and gracefully closes resources.

    Args:
        signal_num: The signal number.
        frame: The current stack frame.
    """
    logger.info("Shutdown signal received. Cleaning up and shutting down gracefully.")
    global aiohttp_session
    # If the aiohttp session exists, close it before exiting
    if aiohttp_session:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(aiohttp_session.close())
    sys.exit(0)

# Register signal handlers for graceful shutdown
signal.signal(signal.SIGINT, handle_interrupt)
signal.signal(signal.SIGTERM, handle_interrupt)

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
        # Log the conversation payload for debugging
        logger.debug(f"Sending conversation payload to OpenAI: {conversation}")
        # Call the OpenAI API for a chat completion
        response = openai.chat.completions.create(
            model=MODEL_NAME,
            messages=conversation,
            max_tokens=500,
            temperature=0.7,
        )
        logger.debug(f"Received response from OpenAI: {response}")

        # Check if any choices were returned
        if not response.choices:
            logger.warning("OpenAI API returned no choices.")
            return ""

        # Retrieve the content of the first choice
        reply = response.choices[0].message.content
        logger.debug(f"Final reply from OpenAI: {reply}")
        return reply

    except Exception as e:
        # Handle any exceptions during API call
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
        """
        Initializes the parser and sets the initial value of og_image to None.
        """
        super().__init__()
        self.og_image = None

    def handle_starttag(self, tag, attrs):
        """
        Handles start tags and checks for the og:image meta tag.

        Args:
            tag (str): The HTML tag name.
            attrs (list): List of (attribute, value) tuples.
        """
        # Check if the tag is a meta tag
        if tag.lower() == "meta":
            attr_dict = dict(attrs)
            # If this meta tag is for og:image and contains content, store it
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
    # Feed the HTML text to the parser
    parser.feed(html_text)
    # Log and return the extracted URL if found
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
        # Make an asynchronous HTTP GET request using the shared session
        async with aiohttp_session.get(url) as response:
            # Check for successful response
            if response.status != 200:
                logger.warning(f"Failed to retrieve URL {url} (status {response.status}).")
                return None
            # Retrieve the response body as text
            html_text = await response.text()
    except Exception as e:
        # Handle any exceptions during the fetch
        handle_exception(e, f"Error fetching URL {url}")
        return None

    try:
        # Extract the direct URL from the fetched HTML
        direct_url = extract_og_image(html_text)
        if direct_url:
            logger.debug(f"Extracted direct GIF URL {direct_url} from {url}")
        else:
            logger.warning(f"No OG image found for URL {url}")
        return direct_url
    except Exception as e:
        # Handle any exceptions during extraction
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
    # Initialize the global aiohttp session if not already done.
    if aiohttp_session is None:
        aiohttp_session = aiohttp.ClientSession()
    try:
        # Set the bot's status and activity
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
            return  # If no message, exit early

        # Retrieve channel name if available; otherwise use channel ID as fallback
        channel_name = getattr(message.channel, "name", f"Channel {message.channel.id}")
        bot_mention = f"<@{bot.user.id}>"

        # Check if the message is a reply to another message and if that message was sent by the bot
        is_reply_to_bot = False
        referenced_message = None
        if message.message_reference and message.message_reference.message_id:
            try:
                # Attempt to fetch the referenced message
                referenced_message = await message.channel.fetch_message(
                    message.message_reference.message_id
                )
                is_reply_to_bot = (referenced_message and referenced_message.author.id == bot.user.id)
            except Exception as e:
                handle_exception(e, f"Failed to fetch referenced message in channel {channel_name}")

        # Ignore messages sent by the bot itself
        if message.author.id == bot.user.id:
            return

        # Only process the message if the bot is mentioned, it has image attachments,
        # or it is a reply to one of the bot's messages
        if bot_mention not in message.content and not message.attachments and not is_reply_to_bot:
            return
        elif bot_mention in message.content:
            # Trigger typing indicator when bot is mentioned
            await message.channel.trigger_typing()

        logger.debug(f"Bot triggered by message {message.id} in channel {channel_name}.")

        # Remove the bot mention from the message text for cleaner processing
        user_text = message.content.replace(bot_mention, "@ChatGPT")
        logger.debug(f"User '{message.author.username}' in channel {channel_name}: {user_text}")

        # Gather URLs for image attachments
        image_urls = [
            attachment.url
            for attachment in message.attachments
            if attachment.content_type and attachment.content_type.startswith("image/")
        ]

        # Build user message parts from text and image URLs
        user_message_parts = [{"type": "text", "text": user_text}]
        for url in image_urls:
            user_message_parts.append({"type": "image_url", "image_url": {"url": url}})

        # Retrieve conversation history for this channel
        conversation_history = channel_message_history[message.channel.id]
        conversation = list(conversation_history)

        # Insert system message if not already present
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

        # If the message is a reply to the bot, include the referenced message content
        if is_reply_to_bot and referenced_message:
            conversation.append({"role": "assistant", "content": referenced_message.content})

        # Append the new user message to the conversation history
        conversation.append({"role": "user", "content": user_message_parts})

        # Generate an AI response based on the conversation history
        reply = await generate_ai_response(conversation, message.channel)
        if not reply:
            await message.channel.send("⚠️ I couldn't generate a response.", reply_to=message.id)
            return

        # Send the reply back to the channel
        await message.channel.send(reply, reply_to=message.id)

        # Update the conversation history with the latest messages
        conversation_history.append({"role": "user", "content": user_message_parts})
        conversation_history.append({"role": "assistant", "content": reply})

    except Exception as e:
        # If an error occurs, log it with the channel name
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
        # Check if the user has administrator permissions
        if not ctx.author.has_permission(interactions.Permissions.ADMINISTRATOR):
            logger.warning(f"Unauthorized /reset attempt by {ctx.author.username}")
            await ctx.send("❌ You do not have permission to use this command.", ephemeral=True)
            return

        # Clear all conversation history
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
        message: interactions.Message = ctx.target  # Retrieve the selected message
        if not message:
            await ctx.send("❌ Could not retrieve the message.", ephemeral=True)
            return

        # Get the channel name (or fallback to channel ID)
        channel_name = getattr(message.channel, "name", f"Channel {message.channel.id}")
        logger.debug(f"User '{ctx.author.username}' requested analysis for message {message.id} in channel {channel_name}")

        # Extract text content from the message
        message_text = message.content or "📜 No text found in message."

        # Process any attachments (images or videos) in the message
        attachment_parts = []
        for attachment in message.attachments:
            if not attachment.content_type:
                continue
            if attachment.content_type.startswith("image/"):
                attachment_parts.append({"type": "image_url", "image_url": {"url": attachment.url}})
            elif attachment.content_type.startswith("video/"):
                attachment_parts.append({"type": "video_url", "video_url": {"url": attachment.url}})

        # Use the precompiled regex to find Tenor/Giphy URLs in the message text
        for url in TENOR_GIPHY_PATTERN.findall(message_text):
            direct_url = await fetch_direct_gif(url)
            if direct_url:
                attachment_parts.append({"type": "image_url", "image_url": {"url": direct_url}})
                logger.debug(f"Added direct GIF URL {direct_url} from {url}")

        # Combine text and attachments into message parts
        user_message_parts = [{"type": "text", "text": message_text}]
        user_message_parts.extend(attachment_parts)

        # Retrieve conversation history for the channel
        conversation_history = channel_message_history[message.channel.id]
        conversation = list(conversation_history)

        # Insert a system message if not already present
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

        # Append the user's analysis request to the conversation
        conversation.append({"role": "user", "content": user_message_parts})

        # Defer the response (useful for context menu commands)
        await ctx.defer()

        # Generate a reply using the AI model
        reply = await generate_ai_response(conversation, ctx.channel)
        if not reply:
            await ctx.send("⚠️ I couldn't generate a response.", ephemeral=True)
            return
        
        # Send the reply back to the user
        await ctx.send(reply, reply_to=message.id)

        # Update conversation history with the new messages
        conversation_history.append({"role": "user", "content": user_message_parts})
        conversation_history.append({"role": "assistant", "content": reply})

    except Exception as e:
        handle_exception(e, f"Unexpected error in 'Analyze with ChatGPT' command by {ctx.author.username}")
        await ctx.send("⚠️ An unexpected error occurred.", ephemeral=True)

# -------------------------
# Bot Startup
# -------------------------
try:
    bot.start(TOKEN)
except Exception as e:
    handle_exception(e, "Exception occurred during bot startup")
    sys.exit(1)
