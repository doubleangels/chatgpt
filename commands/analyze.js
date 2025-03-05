const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { splitMessage, processGifUrls } = require('../utils/messageUtils');
const logger = require('../logger')('analyze.js');
const Sentry = require('../sentry');

module.exports = {
  // Define the command as a context menu command
  data: new ContextMenuCommandBuilder()
    .setName('Analyze with ChatGPT')
    .setType(ApplicationCommandType.Message),
    
  /**
   * Executes the analyze command
   * Processes the target message and generates an AI analysis
   * 
   * @param {ContextMenuInteraction} interaction - The Discord interaction object
   */
  async execute(interaction) {
    // Defer the reply to give time for processing
    await interaction.deferReply();
    
    try {
      const message = interaction.targetMessage;
      const client = interaction.client;
      
      logger.info(`User ${interaction.user.tag} requested analysis for message ${message.id}`, {
        userId: interaction.user.id,
        targetMessageId: message.id,
        targetUserId: message.author.id,
        channelId: interaction.channelId,
        guildId: interaction.guildId
      });
      
      // Get message content or provide a placeholder if empty
      const messageText = message.content || "📜 No text found in message.";
      
      // Process image attachments
      const imageUrls = [];
      message.attachments.forEach(attachment => {
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
          imageUrls.push(attachment.url);
          logger.debug(`Processing image attachment: ${attachment.url}`);
        }
      });
      
      // Process GIFs from links in the message
      const gifUrls = await processGifUrls(messageText);
      imageUrls.push(...gifUrls);
      
      // Prepare message parts for OpenAI API
      const userMessageParts = [];
      
      // Add text content if not empty
      if (messageText) {
        userMessageParts.push({ type: 'text', text: messageText });
      }
      
      // Add image URLs
      imageUrls.forEach(url => {
        userMessageParts.push({ type: 'image_url', image_url: { url } });
      });
      
      // Initialize conversation for this analysis request
      logger.debug(`Creating new conversation for analysis request`);
      const conversation = [
        {
          role: 'system',
          content: `You are a helpful assistant that can analyze text, images, videos, and GIFs.
                   Please analyze the content provided and give insights about it.
                   Send responses in a clear and concise manner, using Discord message formatting.
                   Limit responses to less than 2000 characters.`
        },
        {
          role: 'user',
          content: userMessageParts
        }
      ];
      
      // Generate AI response
      logger.info(`Generating AI analysis for message ${message.id}`);
      const reply = await generateAIResponse(conversation);
      
      if (!reply) {
        logger.warn(`Failed to generate AI analysis for message ${message.id}`);
        await interaction.editReply("⚠️ I couldn't generate an analysis.");
        return;
      }
      
      // Split response if needed and send
      const chunks = splitMessage(reply);
      logger.info(`Sending AI analysis in ${chunks.length} chunks`);
      
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) {
          // First chunk is sent as the main reply
          await interaction.editReply(chunks[i]);
        } else {
          // Additional chunks are sent as follow-up messages
          await interaction.followUp(chunks[i]);
        }
      }
      
    } catch (error) {
      // Log and track errors
      logger.error(`Error analyzing message: ${error.message}`, {
        stack: error.stack,
        interactionId: interaction.id
      });
      
      Sentry.captureException(error, {
        extra: {
          context: 'analyzeCommand',
          interactionId: interaction.id,
          userId: interaction.user.id,
          channelId: interaction.channelId,
          targetMessageId: interaction.targetMessage?.id
        }
      });
      
      // Send error message to user
      await interaction.editReply("⚠️ An error occurred while analyzing the message.");
    }
  },
};
