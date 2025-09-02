const { ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { createSystemMessage, trimConversationHistory } = require('../utils/aiUtils');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const { maxHistoryLength, modelName, supportsVision } = require('../config');

/**
 * User app for quick AI chat access
 * @module userApps/quickChat
 */
module.exports = {
  name: 'Quick Chat',
  type: ApplicationCommandType.User,
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
  
  /**
   * Executes the user app command
   * @param {import('discord.js').UserContextMenuCommandInteraction} interaction - The interaction object
   * @param {import('discord.js').Client} client - The Discord client
   */
  async execute(interaction, client) {
    try {
      // Create a modal for quick chat input
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      
      const modal = new ModalBuilder()
        .setCustomId('quick_chat_modal')
        .setTitle('Quick AI Chat');
      
      const messageInput = new TextInputBuilder()
        .setCustomId('quick_message_input')
        .setLabel('What would you like to ask?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Ask me anything...')
        .setRequired(true)
        .setMaxLength(1000);
      
      const firstActionRow = new ActionRowBuilder().addComponents(messageInput);
      modal.addComponents(firstActionRow);
      
      await interaction.showModal(modal);
      
      logger.info(`User ${interaction.user.tag} initiated quick chat`);
      
    } catch (error) {
      logger.error('Error executing quick chat command:', {
        error: error.stack,
        message: error.message,
        userId: interaction.user.id
      });
      
      await interaction.reply({
        content: '⚠️ An error occurred while setting up the quick chat.',
        ephemeral: true
      });
    }
  }
};
