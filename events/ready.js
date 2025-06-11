const { ActivityType } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

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
    logger.info(`Logged in as ${client.user.tag}!`);

    // Set bot's activity status
    client.user.setActivity('with ChatGPT', { type: ActivityType.Playing });

    // Log the number of guilds the bot is in
    logger.info(`Bot is in ${client.guilds.cache.size} guilds.`);

    // Log each guild the bot is in
    client.guilds.cache.forEach(guild => {
      try {
        logger.info(`Guild: ${guild.name} (${guild.id})`);
      } catch (guildError) {
        logger.error(`Error logging guild info: ${guildError.message}`, {
          error: guildError.stack,
          guildId: guild.id
        });
      }
    });

    // Log the bot's permissions
    try {
      const permissions = client.guilds.cache.map(guild => {
        const botMember = guild.members.cache.get(client.user.id);
        return {
          guildId: guild.id,
          guildName: guild.name,
          permissions: botMember?.permissions.toArray() || []
        };
      });

      logger.info('Bot permissions:', { permissions });
    } catch (error) {
      logger.error('Error logging bot permissions:', {
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
