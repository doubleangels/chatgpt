const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger')(path.basename(__filename));
const config = require('./config');

/**
 * Discord client instance with required intents
 * @type {Client}
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ]
});

// Initialize collections for commands and conversation history
client.commands = new Collection();
client.conversationHistory = new Map();

// Load command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
    logger.info(`Loaded command: ${command.data.name}`);
  } catch (error) {
    logger.error(`Error loading command file: ${file}.`, {
      error: error.stack,
      message: error.message
    });
  }
}

// Load event handler files
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  try {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => {
        try {
          logger.debug(`Executing event: ${event.name}`);
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
          logger.debug(`Executing event: ${event.name}`);
          event.execute(...args, client);
        } catch (error) {
          logger.error(`Error executing event: ${event.name}.`, {
            error: error.stack,
            message: error.message
          });
        }
      });
    }
    logger.info(`Loaded event: ${event.name}`);
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
        await interaction.followUp({ content: 'There was an error executing that command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error executing that command!', ephemeral: true });
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
        await interaction.followUp({ content: 'There was an error executing that command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error executing that command!', ephemeral: true });
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
  setTimeout(() => process.exit(1), 1000);
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