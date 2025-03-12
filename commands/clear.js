const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

module.exports = {
  // Define the command as a slash command with no special permissions
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear your conversation history for this channel.'),

  /**
   * Executes the clear command
   * Clears the conversation history for the user in the current channel
   * 
   * @param {CommandInteraction} interaction - The Discord interaction object
   */
  async execute(interaction) {
    const client = interaction.client;
    const channelId = interaction.channelId;
    const userId = interaction.user.id;

    logger.info(`Clear command initiated by ${interaction.user.tag} in channel ${interaction.channel.name}`, {
      userId: userId,
      channelId: channelId,
      guildId: interaction.guildId
    });

    try {
      // Check if there's conversation history for this channel
      if (client.conversationHistory.has(channelId)) {
        const userHistoryMap = client.conversationHistory.get(channelId);

        // Check if there's history for the specific user
        if (userHistoryMap.has(userId)) {
          const userHistory = userHistoryMap.get(userId);

          // Get the current history length for logging
          const currentLength = userHistory.length;

          // Clear the user's conversation history
          userHistoryMap.delete(userId);

          logger.info(`User conversation history cleared in channel ${channelId}`, {
            userId: userId,
            previousLength: currentLength
          });

          // Inform the user that the clear was successful
          await interaction.reply({ 
            content: '🗑️ Your conversation history has been cleared for this channel.', 
            ephemeral: true 
          });
        } else {
          // No conversation history found for the user
          logger.warn(`Clear command failed - no conversation history found for user ${userId} in channel ${channelId}`);
          await interaction.reply({ 
            content: '⚠️ No conversation history found for you in this channel.', 
            ephemeral: true 
          });
        }
      } else {
        // No conversation history for the channel
        logger.warn(`Clear command failed - no conversation history for channel ${channelId}`);
        await interaction.reply({ 
          content: '⚠️ No conversation history found for this channel.', 
          ephemeral: true 
        });
      }
    } catch (error) {
      // Log and inform the user of any errors that occur during execution
      logger.error(`Error executing clear command in channel ${channelId}: ${error.message}`, {
        error: error.stack,
        userId: userId
      });
      await interaction.reply({ 
        content: '⚠️ An error occurred while trying to clear your conversation history.', 
        ephemeral: true 
      });
    }
  },
};
