/**
 * Ready event handler module for the Discord bot.
 * Handles bot initialization, activity setup, and guild information logging.
 * @module events/ready
 */

const { ActivityType } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

// Log message constants for bot status and activity
const LOG_BOT_ONLINE = 'Bot is online: %s';
const LOG_BOT_ACTIVITY = 'Bot activity set to: %s';
const LOG_GUILD_COUNT = 'Bot is in %d guilds';
const LOG_GUILD_INFO = 'Guild: %s (ID: %s)';
const LOG_GUILD_PERMISSIONS = 'Permissions in %s: %s';
const LOG_ERROR_GETTING_GUILDS = 'Error getting guilds:';
const LOG_ERROR_GETTING_PERMISSIONS = 'Error getting permissions for guild %s:';
const LOG_INIT_HISTORY = "Initialized conversation history storage.";
const LOG_SETUP_COMPLETE = "Bot is ready and setup complete.";

/**
 * Bot's activity configuration for Discord presence
 * @type {Object}
 */
const BOT_ACTIVITY = {
  type: ActivityType.Playing,
  name: 'with ChatGPT'
};

module.exports = {
  name: 'ready',
  once: true,
  /**
   * Handles the ready event when the bot starts up.
   * Sets up the bot's activity, logs guild information,
   * and initializes conversation history storage.
   * 
   * @param {import('discord.js').Client} client - The Discord client instance
   * @returns {void}
   */
  execute(client) {
    try {
      logger.info(LOG_BOT_ONLINE, client.user.tag);

      client.user.setActivity(BOT_ACTIVITY.name, { type: BOT_ACTIVITY.type });
      logger.info(LOG_BOT_ACTIVITY, BOT_ACTIVITY.name);

      const guilds = client.guilds.cache;
      logger.info(LOG_GUILD_COUNT, guilds.size);

      guilds.forEach(guild => {
        try {
          logger.info(LOG_GUILD_INFO, guild.name, guild.id);

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

    if (!client.conversationHistory) {
      client.conversationHistory = new Map();
      logger.debug(LOG_INIT_HISTORY);
    }

    logger.info(LOG_SETUP_COMPLETE, {
      readyTimestamp: new Date().toISOString()
    });
  }
};
