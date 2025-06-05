/**
 * @fileoverview Command to reset all conversation history in a channel (admin only)
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Reset ALL conversation history for this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    

  /**
   * Executes the reset command to clear all conversation history in a channel
   * Preserves system message if it exists, otherwise deletes all history
   * @param {import('discord.js').CommandInteraction} interaction - The interaction object representing the command
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const client = interaction.client;
    const channelId = interaction.channelId;
    const userId = interaction.user.id;
    const channelName = interaction.channel?.name || 'unknown';

    logger.info(`Reset command initiated by ${interaction.user.tag} in channel ${channelName}.`, {
      userId,
      channelId,
      guildId: interaction.guildId
    });

    try {
      if (!client.conversationHistory.has(channelId)) {
        logger.debug(`Reset command failed - no conversation history found for channel ${channelId}.`);
        await interaction.editReply({ 
          content: '⚠️ No conversation history found for this channel.', 
          ephemeral: true 
        });
        return;
      }

      const userHistoryMap = client.conversationHistory.get(channelId);

      const currentLength = userHistoryMap.size;

      const systemMessage = userHistoryMap.get('system');

      if (systemMessage) {
        userHistoryMap.clear();
        userHistoryMap.set('system', systemMessage);
        
        logger.info(`Conversation history reset in channel ${channelId} - preserved system message.`, {
          previousLength: currentLength,
          newLength: 1
        });
      } else {
        client.conversationHistory.delete(channelId);
        logger.info(`Conversation history completely deleted for channel ${channelId}.`, {
          previousLength: currentLength
        });
      }

      await interaction.editReply({ 
        content: '🗑️ Conversation history has been reset for this channel.', 
        ephemeral: false
      });
    } catch (error) {
      logger.error(`Error executing reset command in channel ${channelId}.`, {
        error: error.stack,
        userId,
        message: error.message
      });
      
      await interaction.editReply({ 
        content: '⚠️ An error occurred while trying to reset the conversation history.', 
        ephemeral: true
      });
    }
  },
};
