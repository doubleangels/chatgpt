/**
 * Ready event handler module for the Discord bot.
 * Handles bot initialization, activity setup, and guild information logging.
 * @module events/ready
 */

const { ActivityType } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

/**
 * Bot's activity configuration for Discord presence
 * @type {Object}
 */
const BOT_ACTIVITY = {
  type: ActivityType.Watching,
  name: 'for pings! 📡'
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
      logger.info(`Bot is online: ${client.user.tag}`);

      client.user.setActivity(BOT_ACTIVITY.name, { type: BOT_ACTIVITY.type });
      logger.info(`Bot activity set to: ${BOT_ACTIVITY.name}`);

      const guilds = client.guilds.cache;
      const guildList = Array.from(guilds.values())
        .map(guild => `${guild.name} (ID: ${guild.id})`)
        .join(', ');
      logger.info(`Bot is in ${guilds.size} guilds: ${guildList}`);

    } catch (error) {
      logger.error('Error getting guilds:', {
        error: error.stack,
        message: error.message
      });
    }

    if (!client.conversationHistory) {
      client.conversationHistory = new Map();
      logger.debug('Initialized conversation history storage.');
    }

    logger.info('Bot is ready and setup complete.', {
      readyTimestamp: new Date().toISOString()
    });
  }
};