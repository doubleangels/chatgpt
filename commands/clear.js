const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

module.exports = {
  // Define the command as a slash command with no special permissions.
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear your conversation history for this channel.'),

  /**
   * Executes the clear command.
   * Clears the conversation history for the user in the current channel.
   * 
   * @param {CommandInteraction} interaction - The Discord interaction object.
   */
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const client = interaction.client;
    const channelId = interaction.channelId;
    const userId = interaction.user.id;
    const channelName = interaction.channel?.name || 'unknown';

    logger.info(`Clear command initiated by ${interaction.user.tag} in channel ${channelName}.`, {
      userId,
      channelId,
      guildId: interaction.guildId
    });

    try {
      // Check if there's conversation history for this channel.
      if (!client.conversationHistory.has(channelId)) {
        logger.debug(`No conversation history found for channel ${channelId}.`);
        await interaction.editReply({ 
          content: '⚠️ No conversation history found for this channel.', 
          ephemeral: true 
        });
        return;
      }

      const userHistoryMap = client.conversationHistory.get(channelId);

      // Check if there's history for the specific user.
      if (!userHistoryMap.has(userId)) {
        logger.debug(`No conversation history found for user ${userId} in channel ${channelId}.`);
        await interaction.editReply({ 
          content: '⚠️ No conversation history found for you in this channel.', 
          ephemeral: true 
        });
        return;
      }

      // Get the current history length for logging.
      const userHistory = userHistoryMap.get(userId);
      const currentLength = userHistory?.length || 0;

      // Clear the user's conversation history.
      userHistoryMap.delete(userId);

      logger.info(`User conversation history cleared in channel ${channelId}.`, {
        userId,
        previousLength: currentLength
      });

      // Inform the user that the clear was successful.
      await interaction.editReply({ 
        content: '🗑️ Your conversation history has been cleared for this channel.', 
        ephemeral: false
      });
    } catch (error) {
      // Log and inform the user of any errors that occur during execution.
      logger.error(`Error executing clear command in channel ${channelId}.`, {
        error: error.stack,
        userId,
        message: error.message
      });
      await interaction.editReply({ 
        content: '⚠️ An error occurred while trying to clear your conversation history.', 
        ephemeral: true
      });
    }
  },
};
