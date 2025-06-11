const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js'); 
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

// Embed color constants
const EMBED_COLOR_SUCCESS = 0x00FF00; // Green
const EMBED_COLOR_ERROR = 0xFF0000;   // Red

// Embed title constants
const EMBED_TITLE_NO_HISTORY = '⚠️ No History Found';
const EMBED_TITLE_RESET = '🗑️ History Reset';
const EMBED_TITLE_ERROR = '⚠️ Error';

// Embed description constants
const EMBED_DESC_NO_HISTORY = 'No conversation history found for this channel.';
const EMBED_DESC_RESET = 'Conversation history has been reset for this channel.';
const EMBED_DESC_ERROR = 'An error occurred while trying to reset the conversation history.';

/**
 * Reset command module that allows administrators to reset all conversation history in a specific channel.
 * @module commands/reset
 */
module.exports = {
  /**
   * Command data for the reset command.
   * Requires administrator permissions to use.
   * @type {SlashCommandBuilder}
   */
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Reset ALL conversation history for this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  /**
   * Executes the reset command.
   * Resets all conversation history in the current channel while preserving the system message if it exists.
   * 
   * @param {import('discord.js').CommandInteraction} interaction - The interaction object
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
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR_ERROR)
          .setTitle(EMBED_TITLE_NO_HISTORY)
          .setDescription(EMBED_DESC_NO_HISTORY);
        await interaction.editReply({ embeds: [embed] });
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

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR_SUCCESS)
        .setTitle(EMBED_TITLE_RESET)
        .setDescription(EMBED_DESC_RESET);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error executing reset command in channel ${channelId}.`, {
        error: error.stack,
        userId,
        message: error.message
      });
      
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR_ERROR)
        .setTitle(EMBED_TITLE_ERROR)
        .setDescription(EMBED_DESC_ERROR);
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
