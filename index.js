const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger')(path.basename(__filename));
const config = require('./config');

const COMMANDS_DIRECTORY = 'commands';
const EVENTS_DIRECTORY = 'events';
const FILE_EXTENSION = '.js';

const BOT_INTENTS = [
  GatewayIntentBits.Guilds,           // Allows bot to access basic guild (server) data.
  GatewayIntentBits.GuildMessages,    // Allows bot to read messages in guilds.
  GatewayIntentBits.MessageContent,   // Allows bot to read the content of messages.
];

const ERROR_MESSAGE_COMMAND = 'There was an error executing that command!';
const ERROR_MESSAGE_CONTEXT_MENU = 'There was an error executing that command!';

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

const PROCESS_EXIT_DELAY = 1000;

/**
 * This script initializes and configures a Discord bot using discord.js.
 * It loads commands and event handlers and handles bot interactions, 
 * including slash commands and context menu commands.
 */
const client = new Client({
  intents: BOT_INTENTS
});

client.commands = new Collection();
client.conversationHistory = new Map();

const commandsPath = path.join(__dirname, COMMANDS_DIRECTORY);
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(FILE_EXTENSION));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
    logger.info(`Loaded command: ${command.data.name}.`);
  } catch (error) {
    logger.error(`Error loading command file: ${file}.`, {
      error: error.stack,
      message: error.message
    });
  }
}

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
          logger.error(`Error executing event: ${event.name}.`, {
            error: error.stack,
            message: error.message
          });
        }
      });
    }
    logger.info(`Loaded event: ${event.name}.`);
  } catch (error) {
    logger.error(`Error loading event file: ${file}.`, {
      error: error.stack,
      message: error.message
    });
  }
}

client.once('ready', async () => {
  logger.info(LOG_BOT_ONLINE, client.user.tag);
});

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
      logger.error(LOG_ERROR_SENDING_RESPONSE, {
        error: replyError.stack,
        message: replyError.message,
        originalError: error.message
      });
    }
  }
});

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
      logger.error(LOG_ERROR_SENDING_RESPONSE, {
        error: replyError.stack,
        message: replyError.message,
        originalError: error.message
      });
    }
  }
});

client.login(config.token).catch(error => {
  logger.error(LOG_BOT_LOGIN_ERROR, {
    error: error.stack,
    message: error.message
  });
});

process.on('uncaughtException', (error) => {
  logger.error(LOG_UNCAUGHT_EXCEPTION, {
    error: error.stack,
    message: error.message
  });
  setTimeout(() => process.exit(1), PROCESS_EXIT_DELAY);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(LOG_UNHANDLED_REJECTION, {
    error: reason?.stack,
    message: reason?.message || String(reason)
  });
});

process.on('SIGINT', () => {
  logger.info(LOG_SHUTDOWN_SIGINT);
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info(LOG_SHUTDOWN_SIGTERM);
  process.exit(0);
});
