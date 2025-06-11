const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger')(path.basename(__filename));
const config = require('./config');
const Sentry = require('./sentry');

// File configuration
const COMMANDS_DIRECTORY = 'commands';
const EVENTS_DIRECTORY = 'events';
const FILE_EXTENSION = '.js';

// Bot configuration
const BOT_INTENTS = [
  GatewayIntentBits.Guilds,           // Allows bot to access basic guild (server) data.
  GatewayIntentBits.GuildMessages,    // Allows bot to read messages in guilds.
  GatewayIntentBits.MessageContent,   // Allows bot to read the content of messages.
];

// Error messages
const ERROR_MESSAGE_COMMAND = 'There was an error executing that command!';
const ERROR_MESSAGE_CONTEXT_MENU = 'There was an error executing that command!';

// Log messages
const LOG_BOT_ONLINE = 'Bot is online: %s';
const LOG_EXECUTING_COMMAND = 'Executing command: %s';
const LOG_EXECUTING_CONTEXT_MENU = 'Executing context menu command: %s';
const LOG_CONTEXT_MENU_SUCCESS = 'Context menu command executed successfully: %s';
const LOG_UNKNOWN_CONTEXT_MENU = 'Unknown context menu command: %s';
const LOG_ERROR_SENDING_RESPONSE = 'Error sending error response.';
const LOG_BOT_LOGIN_ERROR = 'Error logging in.';
const LOG_UNCAUGHT_EXCEPTION = 'Uncaught Exception.';
const LOG_UNHANDLED_REJECTION = 'Unhandled Promise Rejection.';
const LOG_SHUTDOWN_SIGINT = 'Shutdown signal (SIGINT) received. Exiting...';
const LOG_SHUTDOWN_SIGTERM = 'Shutdown signal (SIGTERM) received. Exiting...';

// Sentry context
const SENTRY_CONTEXT_LOADING_COMMAND = 'loading_command';
const SENTRY_CONTEXT_EXECUTING_ONCE_EVENT = 'executing_once_event';
const SENTRY_CONTEXT_EXECUTING_EVENT = 'executing_event';
const SENTRY_CONTEXT_LOADING_EVENT = 'loading_event';
const SENTRY_CONTEXT_BOT_LOGIN = 'bot_login_failure';
const SENTRY_CONTEXT_UNCAUGHT = 'uncaughtException';
const SENTRY_CONTEXT_UNHANDLED = 'unhandledRejection';

// Timeouts
const SENTRY_FLUSH_TIMEOUT = 2000;
const PROCESS_EXIT_DELAY = 1000;

/**
 * This script initializes and configures a Discord bot using discord.js.
 * It loads commands and event handlers and handles bot interactions, 
 * including slash commands and context menu commands.
 */
// Create a new Discord client instance with necessary gateway intents.
const client = new Client({
  intents: BOT_INTENTS
});

// Collection to store bot commands.
client.commands = new Collection();

// Collection to store conversation history for chat.
client.conversationHistory = new Map();

// Load and register command files.
const commandsPath = path.join(__dirname, COMMANDS_DIRECTORY);
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(FILE_EXTENSION));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
    logger.info(`Loaded command: ${command.data.name}.`);
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        context: SENTRY_CONTEXT_LOADING_COMMAND,
        commandFile: file
      }
    });
    logger.error(`Error loading command file: ${file}.`, {
      error: error.stack,
      message: error.message
    });
  }
}

// Load and register event files.
const eventsPath = path.join(__dirname, EVENTS_DIRECTORY);
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(FILE_EXTENSION));

for (const file of eventFiles) {
  try {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => {
        try {
          logger.debug(`Executing once event: ${event.name}.`);
          event.execute(...args, client);
        } catch (error) {
          Sentry.captureException(error, {
            extra: {
              context: SENTRY_CONTEXT_EXECUTING_ONCE_EVENT,
              eventName: event.name
            }
          });
          logger.error(`Error executing once event: ${event.name}.`, {
            error: error.stack,
            message: error.message
          });
        }
      });
    } else {
      client.on(event.name, (...args) => {
        try {
          logger.debug(`Executing event: ${event.name}.`);
          event.execute(...args, client);
        } catch (error) {
          Sentry.captureException(error, {
            extra: {
              context: SENTRY_CONTEXT_EXECUTING_EVENT,
              eventName: event.name
            }
          });
          logger.error(`Error executing event: ${event.name}.`, {
            error: error.stack,
            message: error.message
          });
        }
      });
    }
    logger.info(`Loaded event: ${event.name}.`);
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        context: SENTRY_CONTEXT_LOADING_EVENT,
        eventFile: file
      }
    });
    logger.error(`Error loading event file: ${file}.`, {
      error: error.stack,
      message: error.message
    });
  }
}

// Event triggered when the bot is ready.
client.once('ready', async () => {
  logger.info(LOG_BOT_ONLINE, client.user.tag);
});

// Handle interaction events (slash commands).
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    logger.debug(LOG_EXECUTING_COMMAND, interaction.commandName, { 
      user: interaction.user.tag,
      userId: interaction.user.id,
      guildId: interaction.guildId
    });
    await command.execute(interaction);
  } catch (error) {
    // Add Sentry error tracking.
    Sentry.captureException(error, {
      extra: {
        commandName: interaction.commandName,
        userId: interaction.user.id,
        userName: interaction.user.tag,
        guildId: interaction.guildId
      }
    });
    
    logger.error(`Error executing command: ${interaction.commandName}.`, {
      error: error.stack,
      message: error.message,
      user: interaction.user.tag
    });
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: ERROR_MESSAGE_COMMAND, ephemeral: true });
      } else {
        await interaction.reply({ content: ERROR_MESSAGE_COMMAND, ephemeral: true });
      }
    } catch (replyError) {
      // Track the follow-up error as well.
      Sentry.captureException(replyError, {
        extra: { 
          originalError: error.message,
          commandName: interaction.commandName
        }
      });
      logger.error(LOG_ERROR_SENDING_RESPONSE, {
        error: replyError.stack,
        message: replyError.message,
        originalError: error.message
      });
    }
  }
});

// Handle context menu command interactions.
client.on('interactionCreate', async interaction => {
  if (!interaction.isContextMenuCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn(LOG_UNKNOWN_CONTEXT_MENU, interaction.commandName);
    return;
  }

  logger.debug(LOG_EXECUTING_CONTEXT_MENU, interaction.commandName, { 
    user: interaction.user.tag,
    userId: interaction.user.id,
    guildId: interaction.guildId
  });

  try {
    await command.execute(interaction);
    logger.debug(LOG_CONTEXT_MENU_SUCCESS, interaction.commandName);
  } catch (error) {
    // Add Sentry error tracking.
    Sentry.captureException(error, {
      extra: {
        commandType: 'contextMenu',
        commandName: interaction.commandName,
        userId: interaction.user.id,
        userName: interaction.user.tag,
        guildId: interaction.guildId
      }
    });
    
    logger.error(`Error executing context menu command: ${interaction.commandName}.`, { 
      error: error.stack,
      message: error.message,
      user: interaction.user.tag
    });

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: ERROR_MESSAGE_CONTEXT_MENU, ephemeral: true });
      } else {
        await interaction.reply({ content: ERROR_MESSAGE_CONTEXT_MENU, ephemeral: true });
      }
    } catch (replyError) {
      // Track the follow-up error as well.
      Sentry.captureException(replyError, {
        extra: { 
          originalError: error.message,
          commandName: interaction.commandName,
          commandType: 'contextMenu'
        }
      });
      logger.error(LOG_ERROR_SENDING_RESPONSE, {
        error: replyError.stack,
        message: replyError.message,
        originalError: error.message
      });
    }
  }
});

// Log the bot in using the token from the config file.
client.login(config.token).catch(error => {
  Sentry.captureException(error, {
    extra: { context: SENTRY_CONTEXT_BOT_LOGIN }
  });
  logger.error(LOG_BOT_LOGIN_ERROR, {
    error: error.stack,
    message: error.message
  });
});

// Add global unhandled error handlers.
process.on('uncaughtException', (error) => {
  Sentry.captureException(error, {
    extra: { context: SENTRY_CONTEXT_UNCAUGHT }
  });
  logger.error(LOG_UNCAUGHT_EXCEPTION, {
    error: error.stack,
    message: error.message
  });
  // Don't exit immediately to allow Sentry to send the error.
  setTimeout(() => process.exit(1), PROCESS_EXIT_DELAY);
});

process.on('unhandledRejection', (reason, promise) => {
  Sentry.captureException(reason, {
    extra: { context: SENTRY_CONTEXT_UNHANDLED }
  });
  logger.error(LOG_UNHANDLED_REJECTION, {
    error: reason?.stack,
    message: reason?.message || String(reason)
  });
});

// Gracefully handle termination signals (for clean bot shutdown).
process.on('SIGINT', () => {
  logger.info(LOG_SHUTDOWN_SIGINT);
  // Flush Sentry events before exiting.
  Sentry.close(SENTRY_FLUSH_TIMEOUT).then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info(LOG_SHUTDOWN_SIGTERM);
  // Flush Sentry events before exiting.
  Sentry.close(SENTRY_FLUSH_TIMEOUT).then(() => {
    process.exit(0);
  });
});
