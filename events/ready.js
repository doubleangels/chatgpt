const { ActivityType } = require('discord.js');
const path = require('path')
const logger = require('../logger')(path.basename(__filename));

 /**
  * Event handler for the 'ready' event.
  * Executed once when the bot comes online. It sets the bot's presence,
  * attempts to reschedule Disboard reminders, and reschedules all mute kicks.
  *
  * @param {Client} client - The Discord client instance.
  */
module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    logger.info("Bot is online! Initializing setup procedures...");

    try {
      // Set the bot's presence with a custom activity.
      await client.user.setPresence({
        activities: [{
          name: "for pings! 📡",
          type: ActivityType.Watching
        }],
        status: "online"
      });
      logger.debug("Bot presence and activity set:", { activity: "Watching for pings", status: "online" });
    } catch (error) {
      logger.error("Failed to set bot presence:", { error });
    }

    logger.info("Bot is ready and setup complete!");
  }
};