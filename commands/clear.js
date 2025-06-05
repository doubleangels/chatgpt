/**
 * @fileoverview Command to clear a user's conversation history in a specific channel
 */

const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear your conversation history for this channel.'),

  /**
   * Executes the clear command to remove a user's conversation history from a channel
   * @param {import('discord.js').CommandInteraction} interaction - The interaction object representing the command
   * @returns {Promise<void>}
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
      // Check if channel has any conversation history
      if (!client.conversationHistory.has(channelId)) {
        logger.debug(`No conversation history found for channel ${channelId}.`);
        await interaction.editReply({ 
          content: '⚠️ No conversation history found for this channel.', 
          ephemeral: true 
        });
        return;
      }

      const userHistoryMap = client.conversationHistory.get(channelId);

      // Check if user has any conversation history in this channel
      if (!userHistoryMap.has(userId)) {
        logger.debug(`No conversation history found for user ${userId} in channel ${channelId}.`);
        await interaction.editReply({ 
          content: '⚠️ No conversation history found for you in this channel.', 
          ephemeral: true 
        });
        return;
      }

      const userHistory = userHistoryMap.get(userId);
      const currentLength = userHistory?.length || 0;

      // Remove user's conversation history
      userHistoryMap.delete(userId);

      logger.info(`User conversation history cleared in channel ${channelId}.`, {
        userId,
        previousLength: currentLength
      });

      await interaction.editReply({ 
        content: '🗑️ Your conversation history has been cleared for this channel.', 
        ephemeral: false
      });
    } catch (error) {
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
