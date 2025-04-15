const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

module.exports = {
  // Define the command as a slash command with administrator permissions.
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Reset ALL conversation history for this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  /**
   * Executes the reset command.
   * Resets the conversation history for the current channel.
   * 
   * @param {CommandInteraction} interaction - The Discord interaction object.
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
      // Check if there's conversation history for this channel.
      if (!client.conversationHistory.has(channelId)) {
        logger.debug(`Reset command failed - no conversation history found for channel ${channelId}.`);
        await interaction.editReply({ 
          content: '⚠️ No conversation history found for this channel.', 
          ephemeral: true 
        });
        return;
      }

      const userHistoryMap = client.conversationHistory.get(channelId);

      // Get the current history length for logging.
      const currentLength = userHistoryMap.size;

      // Preserve system message if it exists.
      const systemMessage = userHistoryMap.get('system');

      if (systemMessage) {
        // Reset history but keep the system message.
        userHistoryMap.clear();
        userHistoryMap.set('system', systemMessage);
        
        logger.info(`Conversation history reset in channel ${channelId} - preserved system message.`, {
          previousLength: currentLength,
          newLength: 1
        });
      } else {
        // No system message found, delete the entire history.
        client.conversationHistory.delete(channelId);
        logger.info(`Conversation history completely deleted for channel ${channelId}.`, {
          previousLength: currentLength
        });
      }

      // Inform the user that the reset was successful.
      await interaction.editReply({ 
        content: '🗑️ Conversation history has been reset for this channel.', 
        ephemeral: false  // Making success messages public as requested
      });
    } catch (error) {
      // Log and inform the user of any errors that occur during execution.
      logger.error(`Error executing reset command in channel ${channelId}.`, {
        error: error.stack,
        userId,
        message: error.message
      });
      
      await interaction.editReply({ 
        content: '⚠️ An error occurred while trying to reset the conversation history.', 
        ephemeral: true  // Keeping errors ephemeral as requested
      });
    }
  },
};
