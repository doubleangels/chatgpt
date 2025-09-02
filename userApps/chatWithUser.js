const { ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { createSystemMessage, trimConversationHistory } = require('../utils/aiUtils');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const { maxHistoryLength, modelName, supportsVision } = require('../config');

/**
 * User app for starting private chats with the bot
 * @module userApps/chatWithUser
 */
module.exports = {
  name: 'Chat with User',
  type: ApplicationCommandType.User,
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
  
  /**
   * Executes the user app command
   * @param {import('discord.js').UserContextMenuCommandInteraction} interaction - The interaction object
   * @param {import('discord.js').Client} client - The Discord client
   */
  async execute(interaction, client) {
    const targetUser = interaction.targetUser;
    const userId = interaction.user.id;
    const targetUserId = targetUser.id;
    
    // Don't allow users to chat with themselves
    if (userId === targetUserId) {
      await interaction.reply({
        content: "❌ You can't start a chat with yourself!",
        ephemeral: true
      });
      return;
    }
    
    // Don't allow users to chat with bots
    if (targetUser.bot) {
      await interaction.reply({
        content: "❌ You can't start a chat with a bot!",
        ephemeral: true
      });
      return;
    }
    
    try {
      // Create a unique conversation ID for this user pair
      const conversationId = `user_${userId}_${targetUserId}`;
      
      // Initialize conversation history if it doesn't exist
      if (!client.conversationHistory.has(conversationId)) {
        const systemMessage = createSystemMessage(modelName, supportsVision());
        client.conversationHistory.set(conversationId, [systemMessage]);
        logger.info(`Created new user-to-user conversation: ${conversationId}`);
      }
      
      // Create a modal for the user to input their message
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      
      const modal = new ModalBuilder()
        .setCustomId(`chat_modal_${conversationId}`)
        .setTitle(`Chat with ${targetUser.username}`);
      
      const messageInput = new TextInputBuilder()
        .setCustomId('message_input')
        .setLabel('What would you like to say?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Type your message here...')
        .setRequired(true)
        .setMaxLength(1000);
      
      const firstActionRow = new ActionRowBuilder().addComponents(messageInput);
      modal.addComponents(firstActionRow);
      
      await interaction.showModal(modal);
      
      logger.info(`User ${interaction.user.tag} initiated chat with ${targetUser.tag}`);
      
    } catch (error) {
      logger.error('Error executing chat with user command:', {
        error: error.stack,
        message: error.message,
        userId,
        targetUserId
      });
      
      await interaction.reply({
        content: '⚠️ An error occurred while setting up the chat.',
        ephemeral: true
      });
    }
  }
};
