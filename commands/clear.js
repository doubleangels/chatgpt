const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

const EMBED_COLOR_SUCCESS = 0x00FF00;
const EMBED_COLOR_ERROR = 0xFF0000;

const EMBED_TITLE_NO_HISTORY = '⚠️ No History Found';
const EMBED_TITLE_CLEAR = '🗑️ History Cleared';
const EMBED_TITLE_ERROR = '⚠️ Error';

const EMBED_DESC_NO_CHANNEL_HISTORY = 'No conversation history found for this channel.';
const EMBED_DESC_NO_USER_HISTORY = 'No conversation history found for you in this channel.';
const EMBED_DESC_CLEAR = 'Your conversation history has been cleared for this channel.';
const EMBED_DESC_ERROR = 'An error occurred while trying to clear your conversation history.';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear your conversation history for this channel.'),

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
      if (!client.conversationHistory.has(channelId)) {
        logger.debug(`No conversation history found for channel ${channelId}.`);
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR_ERROR)
          .setTitle(EMBED_TITLE_NO_HISTORY)
          .setDescription(EMBED_DESC_NO_CHANNEL_HISTORY);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const userHistoryMap = client.conversationHistory.get(channelId);

      if (!userHistoryMap.has(userId)) {
        logger.debug(`No conversation history found for user ${userId} in channel ${channelId}.`);
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR_ERROR)
          .setTitle(EMBED_TITLE_NO_HISTORY)
          .setDescription(EMBED_DESC_NO_USER_HISTORY);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const userHistory = userHistoryMap.get(userId);
      const currentLength = userHistory?.length || 0;

      userHistoryMap.delete(userId);

      logger.info(`User conversation history cleared in channel ${channelId}.`, {
        userId,
        previousLength: currentLength
      });

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR_SUCCESS)
        .setTitle(EMBED_TITLE_CLEAR)
        .setDescription(EMBED_DESC_CLEAR);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error executing clear command in channel ${channelId}.`, {
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
