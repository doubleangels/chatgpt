const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path')
const logger = require('../logger')(path.basename(__filename));

module.exports = {
  // Define the command as a slash command with administrator permissions
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Reset the conversation history for this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  /**
   * Executes the reset command
   * Resets the conversation history for the current channel
   * 
   * @param {CommandInteraction} interaction - The Discord interaction object
   */
  async execute(interaction) {
    const client = interaction.client;
    const channelId = interaction.channelId;
    
    logger.info(`Reset command initiated by ${interaction.user.tag} in channel ${interaction.channel.name}`, {
      userId: interaction.user.id,
      channelId: channelId,
      guildId: interaction.guildId
    });
    
    // Check if there's conversation history for this channel
    if (client.conversationHistory.has(channelId)) {
      // Preserve system message if it exists
      const systemMessage = client.conversationHistory.get(channelId).find(msg => msg.role === 'system');
      
      // Get the current history length for logging
      const currentLength = client.conversationHistory.get(channelId).length;
      
      if (systemMessage) {
        // Reset history but keep the system message
        client.conversationHistory.set(channelId, [systemMessage]);
        logger.info(`Conversation history reset in channel ${channelId}, preserved system message`, {
          previousLength: currentLength,
          newLength: 1
        });
      } else {
        // No system message found, delete the entire history
        client.conversationHistory.delete(channelId);
        logger.info(`Conversation history completely deleted for channel ${channelId}`, {
          previousLength: currentLength
        });
      }
      
      // Inform the user that the reset was successful
      await interaction.reply({ 
        content: '🗑️ **Conversation history has been reset for this channel.**', 
        ephemeral: true 
      });
    } else {
      // No conversation history found
      logger.warn(`Reset command failed - no conversation history found for channel ${channelId}`);
      await interaction.reply({ 
        content: '⚠️ No conversation history found for this channel.', 
        ephemeral: true 
      });
    }
  },
};
