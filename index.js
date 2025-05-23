const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger')(path.basename(__filename));
const config = require('./config');
const Sentry = require('./sentry');

/**
 * This script initializes and configures a Discord bot using discord.js.
 * It loads commands and event handlers and handles bot interactions, 
 * including slash commands and context menu commands.
 */
// Create a new Discord client instance with necessary gateway intents.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // Allows bot to access basic guild (server) data.
    GatewayIntentBits.GuildMessages,    // Allows bot to read messages in guilds.
    GatewayIntentBits.MessageContent,   // Allows bot to read the content of messages.
  ]
});

// Collection to store bot commands.
client.commands = new Collection();

// Collection to store conversation history for chat.
client.conversationHistory = new Map();

// Load and register command files.
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
    logger.info(`Loaded command: ${command.data.name}.`);
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        context: 'loading_command',
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
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

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
              context: 'executing_once_event',
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
              context: 'executing_event',
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
        context: 'loading_event',
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
  logger.info(`Bot is online: ${client.user.tag}.`);
});

// Handle interaction events (slash commands).
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    logger.debug(`Executing command: ${interaction.commandName}.`, { 
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
      const errorMessage = 'There was an error executing that command!';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      // Track the follow-up error as well.
      Sentry.captureException(replyError, {
        extra: { 
          originalError: error.message,
          commandName: interaction.commandName
        }
      });
      logger.error("Error sending error response.", {
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
    logger.warn(`Unknown context menu command: ${interaction.commandName}.`);
    return;
  }

  logger.debug(`Executing context menu command: ${interaction.commandName}.`, { 
    user: interaction.user.tag,
    userId: interaction.user.id,
    guildId: interaction.guildId
  });

  try {
    await command.execute(interaction);
    logger.debug(`Context menu command executed successfully: ${interaction.commandName}.`);
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
      const errorMessage = 'There was an error executing that command!';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
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
      logger.error("Error sending error response.", {
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
    extra: { context: 'bot_login_failure' }
  });
  logger.error("Error logging in.", {
    error: error.stack,
    message: error.message
  });
});

// Add global unhandled error handlers.
process.on('uncaughtException', (error) => {
  Sentry.captureException(error, {
    extra: { context: 'uncaughtException' }
  });
  logger.error('Uncaught Exception.', {
    error: error.stack,
    message: error.message
  });
  // Don't exit immediately to allow Sentry to send the error.
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  Sentry.captureException(reason, {
    extra: { context: 'unhandledRejection' }
  });
  logger.error('Unhandled Promise Rejection.', {
    error: reason?.stack,
    message: reason?.message || String(reason)
  });
});
// Gracefully handle termination signals (for clean bot shutdown).
process.on('SIGINT', () => {
  logger.info("Shutdown signal (SIGINT) received. Exiting...");
  // Flush Sentry events before exiting.
  Sentry.close(2000).then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info("Shutdown signal (SIGTERM) received. Exiting...");
  // Flush Sentry events before exiting.
  Sentry.close(2000).then(() => {
    process.exit(0);
  });
});
