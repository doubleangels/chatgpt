const { ActivityType } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const Sentry = require('../sentry');

module.exports = {
  name: 'ready',
  once: true,
  /**
   * Executes once when the bot comes online.
   * Sets up the bot's presence and initial state.
   * 
   * @param {Client} client - The Discord client instance.
   */
  async execute(client) {
    logger.info("Bot is online! Initializing setup procedures.", {
      username: client.user.tag,
      userId: client.user.id,
      guilds: client.guilds.cache.size
    });

    try {
      // Set the bot's presence with a custom activity.
      await client.user.setPresence({
        activities: [{
          name: "for pings! 📡",
          type: ActivityType.Watching
        }],
        status: "online"
      });
      
      logger.debug("Bot presence and activity set successfully.", { 
        activity: "Watching for pings!", 
        status: "online" 
      });
      
      // Log information about connected guilds.
      try {
        const guildCount = client.guilds.cache.size;
        logger.info(`Connected to ${guildCount} guild(s).`);
        
        client.guilds.cache.forEach(guild => {
          logger.info(`Connected to guild: ${guild.name}.`, {
            guildId: guild.id,
            memberCount: guild.memberCount,
            channelCount: guild.channels.cache.size
          });
        });
      } catch (guildError) {
        Sentry.captureException(guildError, {
          extra: {
            context: 'logging_connected_guilds',
            botId: client.user.id
          }
        });
      
        logger.error("Failed to log connected guilds.", {
          error: guildError.stack,
          message: guildError.message
        });
      }

    } catch (error) {
      Sentry.captureException(error, {
        extra: {
          context: 'setting_bot_presence',
          botId: client.user.id
        }
      });
      
      logger.error("Failed to set bot presence.", { 
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
