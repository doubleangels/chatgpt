const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger')(path.basename(__filename));
const config = require('./config');

/** Directory containing command files */
const COMMANDS_DIRECTORY = 'commands';
/** Directory containing event handler files */
const EVENTS_DIRECTORY = 'events';
/** File extension for command and event files */
const FILE_EXTENSION = '.js';

/**
 * Bot's required Discord gateway intents
 * @type {Array<number>}
 */
const BOT_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
];

// Error message constants
const ERROR_MESSAGE_COMMAND = 'There was an error executing that command!';
const ERROR_MESSAGE_CONTEXT_MENU = 'There was an error executing that command!';

/** Delay in milliseconds before forced process exit */
const PROCESS_EXIT_DELAY = 1000;

/**
 * Discord client instance with required intents
 * @type {Client}
 */
const client = new Client({
  intents: BOT_INTENTS
});

// Initialize collections for commands and conversation history
client.commands = new Collection();
client.conversationHistory = new Map();

// Load command files
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

// Load event handler files
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
  logger.info(`Bot is online: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    logger.debug(`Executing command: ${interaction.commandName}`, { 
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
      logger.error('Error sending error response.', {
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
    logger.warn(`Unknown context menu command: ${interaction.commandName}`);
    return;
  }

  logger.debug(`Executing context menu command: ${interaction.commandName}`, { 
    user: interaction.user.tag,
    userId: interaction.user.id,
    guildId: interaction.guildId
  });

  try {
    await command.execute(interaction);
    logger.debug(`Context menu command executed successfully: ${interaction.commandName}`);
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
      logger.error('Error sending error response.', {
        error: replyError.stack,
        message: replyError.message,
        originalError: error.message
      });
    }
  }
});

client.login(config.token).catch(error => {
  logger.error('Error logging in.', {
    error: error.stack,
    message: error.message
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception.', {
    error: error.stack,
    message: error.message
  });
  setTimeout(() => process.exit(1), PROCESS_EXIT_DELAY);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection.', {
    error: reason?.stack,
    message: reason?.message || String(reason)
  });
});

process.on('SIGINT', () => {
  logger.info('Shutdown signal (SIGINT) received. Exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutdown signal (SIGTERM) received. Exiting...');
  process.exit(0);
});
