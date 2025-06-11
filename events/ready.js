const { ActivityType } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

// Log message constants
const LOG_BOT_ONLINE = 'Bot is online: %s';
const LOG_BOT_ACTIVITY = 'Bot activity set to: %s';
const LOG_GUILD_COUNT = 'Bot is in %d guilds';
const LOG_GUILD_INFO = 'Guild: %s (ID: %s)';
const LOG_GUILD_PERMISSIONS = 'Permissions in %s: %s';
const LOG_ERROR_GETTING_GUILDS = 'Error getting guilds:';
const LOG_ERROR_GETTING_PERMISSIONS = 'Error getting permissions for guild %s:';

// Activity configuration
const BOT_ACTIVITY = {
  type: ActivityType.Playing,
  name: 'with ChatGPT'
};

module.exports = {
  name: 'ready',
  once: true,
  /**
   * Executes once when the bot comes online.
   * Sets up the bot's presence and initial state.
   * 
   * @param {Client} client - The Discord client instance.
   */
  execute(client) {
    try {
      // Log that the bot is online
      logger.info(LOG_BOT_ONLINE, client.user.tag);

      // Set bot activity
      client.user.setActivity(BOT_ACTIVITY.name, { type: BOT_ACTIVITY.type });
      logger.info(LOG_BOT_ACTIVITY, BOT_ACTIVITY.name);

      // Get and log guild information
      const guilds = client.guilds.cache;
      logger.info(LOG_GUILD_COUNT, guilds.size);

      // Log detailed information about each guild
      guilds.forEach(guild => {
        try {
          logger.info(LOG_GUILD_INFO, guild.name, guild.id);

          // Get bot's permissions in the guild
          const permissions = guild.members.me.permissions.toArray();
          logger.info(LOG_GUILD_PERMISSIONS, guild.name, permissions.join(', '));
        } catch (error) {
          logger.error(LOG_ERROR_GETTING_PERMISSIONS, guild.name, {
            error: error.stack,
            message: error.message
          });
        }
      });
    } catch (error) {
      logger.error(LOG_ERROR_GETTING_GUILDS, {
        error: error.stack,
        message: error.message
      });
    }

    // Initialize conversation history Map if it doesn't exist.
    if (!client.conversationHistory) {
      client.conversationHistory = new Map();
      logger.debug("Initialized conversation history storage.");
    }

    logger.info("Bot is ready and setup complete.", {
      readyTimestamp: new Date().toISOString()
    });
  }
};
