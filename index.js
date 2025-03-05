const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger')('index.js');
const config = require('./config');
const Sentry = require('./sentry');

// Create a new Discord client instance with necessary gateway intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // Allows bot to access basic guild (server) data
    GatewayIntentBits.GuildMessages,    // Allows bot to read messages in guilds
    GatewayIntentBits.MessageContent,   // Allows bot to read the content of messages
  ]
});

// Initialize collections to store bot commands and conversation history
client.commands = new Collection();
client.conversationHistory = new Collection();

logger.info("Starting Discord ChatGPT bot...");

/**
 * Load command files from the commands directory
 * Each command is registered in the client.commands collection
 */
logger.info("Loading commands...");
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    // Import the command module
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // Validate command structure
    if (!command.data || !command.execute) {
      logger.warn(`Command ${file} is missing required properties`, {
        file,
        hasData: !!command.data,
        hasExecute: !!command.execute
      });
      continue;
    }
    
    // Register command in the collection
    client.commands.set(command.data.name, command);
    logger.info("Loaded command:", { command: command.data.name, file });
  } catch (error) {
    logger.error(`Error loading command from ${file}:`, { 
      error: error.message, 
      stack: error.stack 
    });
    
    Sentry.captureException(error, {
      extra: {
        context: 'commandLoading',
        file
      }
    });
  }
}

/**
 * Load event files from the events directory
 * Each event is registered to the client with the appropriate handler
 */
logger.info("Loading events...");
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  try {
    // Import the event module
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    // Validate event structure
    if (!event.name || !event.execute) {
      logger.warn(`Event ${file} is missing required properties`, {
        file,
        hasName: !!event.name,
        hasExecute: !!event.execute
      });
      continue;
    }
    
    // Register the event with the appropriate handler (once or on)
    if (event.once) {
      client.once(event.name, (...args) => {
        logger.debug("Executing once event:", { event: event.name });
        event.execute(...args, client);
      });
    } else {
      client.on(event.name, (...args) => {
        logger.debug("Executing event:", { event: event.name });
        event.execute(...args, client);
      });
    }
    
    logger.info("Loaded event:", { event: event.name, once: !!event.once, file });
  } catch (error) {
    logger.error(`Error loading event from ${file}:`, { 
      error: error.message, 
      stack: error.stack 
    });
    
    Sentry.captureException(error, {
      extra: {
        context: 'eventLoading',
        file
      }
    });
  }
}

/**
 * Event triggered when the bot is ready
 * This is in addition to the ready.js event handler for critical startup logging
 */
client.once('ready', async () => {
  logger.info("Bot is online:", { 
    tag: client.user.tag,
    id: client.user.id,
    guildCount: client.guilds.cache.size
  });
});

/**
 * Log the bot in using the token from the config file
 * This connects the bot to Discord
 */
logger.info("Attempting to log in to Discord...");
client.login(config.token).catch(err => {
  Sentry.captureException(err, {
    extra: { context: 'bot_login_failure' }
  });
  logger.error("Error logging in:", { 
    error: err.message, 
    stack: err.stack 
  });
  process.exit(1); // Exit with error code if login fails
});

/**
 * Global unhandled error handlers
 * These catch errors that would otherwise crash the application
 */
process.on('uncaughtException', (error) => {
  Sentry.captureException(error, {
    extra: { context: 'uncaughtException' }
  });
  logger.error('Uncaught Exception:', { 
    error: error.message, 
    stack: error.stack 
  });
  // Don't exit immediately to allow Sentry to send the error
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  Sentry.captureException(reason, {
    extra: { context: 'unhandledRejection' }
  });
  logger.error('Unhandled Promise Rejection:', { 
    reason: reason?.message || reason, 
    stack: reason?.stack
  });
});

/**
 * Gracefully handle termination signals for clean bot shutdown
 * This ensures all processes are properly closed before exiting
 */
process.on('SIGINT', () => {
  logger.info("Shutdown signal (SIGINT) received. Exiting...");
  // Flush Sentry events before exiting
  Sentry.close(2000).then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info("Shutdown signal (SIGTERM) received. Exiting...");
  // Flush Sentry events before exiting
  Sentry.close(2000).then(() => {
    process.exit(0);
  });
});
