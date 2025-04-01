const { ActivityType } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

module.exports = {
  name: 'ready',
  once: true,
  /**
   * Executes once when the bot comes online
   * Sets up the bot's presence and initial state
   * 
   * @param {Client} client - The Discord client instance
   */
  async execute(client) {
    logger.info("Bot is online! Initializing setup procedures...", {
      username: client.user.tag,
      userId: client.user.id,
      guilds: client.guilds.cache.size
    });

    try {
      // Set the bot's presence with a custom activity
      await client.user.setPresence({
        activities: [{
          name: "for pings! 📡",
          type: ActivityType.Watching
        }],
        status: "online"
      });
      
      logger.debug("Bot presence and activity set successfully:", { 
        activity: "Watching for pings!", 
        status: "online" 
      });
      
      // Log information about connected guilds
      try {
        client.guilds.cache.forEach(guild => {
          logger.info(`Connected to guild: ${guild.name}`, {
            guildId: guild.id,
            memberCount: guild.memberCount,
            channelCount: guild.channels.cache.size
          });
        });
      } catch (guildError) {
        logger.error("Failed to log connected guilds:", {
          error: guildError.message,
          stack: guildError.stack
        });
      }
      
    } catch (error) {
      logger.error("Failed to set bot presence:", { 
        error: error.message,
        stack: error.stack
      });
    }

    logger.info("Bot is ready and setup complete!", {
      readyTimestamp: new Date().toISOString()
    });
  }
};
