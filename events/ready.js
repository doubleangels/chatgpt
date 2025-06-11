/**
 * @fileoverview Handles bot initialization and setup when it comes online
 */

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

/**
 * Bot's activity configuration
 * @type {Object}
 */
const BOT_ACTIVITY = {
  type: ActivityType.Playing,
  name: 'with ChatGPT'
};

/**
 * Ready event handler module
 * @module events/ready
 */
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
      logger.debug("Initialized conversation history storage.");
    }

    logger.info("Bot is ready and setup complete.", {
      readyTimestamp: new Date().toISOString()
    });
  }
};
