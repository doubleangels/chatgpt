const { Events, MessageType } = require('discord.js');
const { generateAIResponse, processImageAttachments, createMessageContent } = require('../utils/aiService');
const { splitMessage } = require('../utils/messageUtils');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const { maxHistoryLength, modelName, supportsVision } = require('../config');
const config = require('../config');

/**
 * Message create event handler module
 * @module events/messageCreate
 */
module.exports = {
  name: Events.MessageCreate,
  /**
   * Handles incoming messages and generates AI responses when appropriate.
   * Processes messages that mention the bot or are replies to the bot's messages.
   * Maintains conversation history for each user in each channel.
   * 
   * @param {import('discord.js').Message} message - The message that triggered the event
   * @returns {Promise<void>}
   */
  async execute(message) {
    if (message.author.bot) {
      logger.debug(`Ignoring bot message from ${message.author.tag}.`);
      return;
    }

    const client = message.client;
    const botMention = `<@${client.user.id}>`;
    const channelId = message.channelId;
    const userId = message.author.id;
    const channelName = message.channel?.name || 'unknown';

    let isReplyToBot = false;
    let referencedMessage = null;

    if (message.reference && message.reference.messageId) {
      try {
        referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
        isReplyToBot = referencedMessage.author.id === client.user.id;

        if (isReplyToBot) {
          logger.debug(`Message ${message.id} is a reply to bot's message: ${referencedMessage.id}.`);
        }
      } catch (error) {
        logger.error(`Failed to fetch referenced message ${message.reference.messageId}.`, {
          error: error.stack,
          messageId: message.id,
          errorMessage: error.message
        });
      }
    }

    const hasBotMention = message.content.includes(botMention);

    if (!hasBotMention && !isReplyToBot) {
      return;
    }

    try {
      await message.channel.sendTyping();
    } catch (err) {
      logger.warn(`Failed to send typing indicator in channel ${channelId}.`, {
        errorMessage: err.message,
        channelId
      });
    }

    logger.info(`Message received from ${message.author.tag} in ${channelName}: ${message.content}`);
    logger.debug(`Processing message from ${message.author.tag} in ${channelName}`);

    const userText = message.content.replace(botMention, '@ChatGPT').trim();
    
    let imageContents = [];
    if (message.attachments && message.attachments.size > 0) {
      if (!supportsVision()) {
        logger.warn(`Image attachments detected but current model ${modelName} does not support vision. Images will be ignored.`);
        await message.reply({
          content: "⚠️ I received an image, but the current model doesn't support image analysis. Please use a model like gpt-4o-mini or gpt-4o for image support.",
          ephemeral: true
        });
      } else {
        logger.debug(`Processing ${message.attachments.size} attachment(s) from message ${message.id}`);
        imageContents = await processImageAttachments(Array.from(message.attachments.values()));
        logger.info(`Processed ${imageContents.length} image(s) from message ${message.id}`);
      }
    }

    if (!client.conversationHistory.has(channelId)) {
      logger.debug(`No conversation history found for channel ${channelId}`);
      client.conversationHistory.set(channelId, new Map());
      logger.info(`Created new conversation history for channel ${channelId}`);
    }

    const channelHistory = client.conversationHistory.get(channelId);
    if (!channelHistory.has(userId)) {
      const visionCapability = supportsVision() 
        ? "You can analyze and respond to both text and images. When users send images, provide a description of the images, including what is pictured."
        : "You can respond to text messages. Image analysis is not supported by the current model.";
        
      channelHistory.set(userId, [{
        role: 'system',
        content: `You are a helpful assistant powered by the ${modelName} model. ${visionCapability} You are aware that you are using the ${modelName} model and can reference this when appropriate. Format your responses using Discord markdown: use ## for headers, **bold** for emphasis, *italic* for subtle emphasis, \`code\` for inline code, \`\`\`language\ncode\`\`\` for code blocks, - for bullet points, 1. for numbered lists, and -# for smaller text. Make your responses visually appealing and well-structured, keeping responses under 2000 characters.`
      }]);
    }

    const userHistory = channelHistory.get(userId);
    if (isReplyToBot && referencedMessage) {
      logger.debug(`Adding bot's previous response to conversation history for user ${userId} in channel ${channelId}.`);
      userHistory.push({
        role: 'assistant',
        content: referencedMessage.content
      });
    }

    logger.debug(`Adding user message (${message.id}) to conversation history for user ${userId}.`);
    
    const messageContent = createMessageContent(userText, imageContents);
    
    let finalMessageContent = messageContent;
    if (imageContents.length > 0 && supportsVision()) {
      if (!userText || userText.trim() === '') {
        finalMessageContent = [
          {
            type: 'text',
            text: 'Please provide a description of this image, including what is pictured.'
          },
          ...imageContents
        ];
      }
    }
    
    userHistory.push({
      role: 'user',
      content: finalMessageContent
    });

    if (userHistory.length > 10) {
      logger.debug(`Trimming conversation history for user ${userId} in channel ${channelId} (current: ${userHistory.length}, max: 10).`);
      userHistory.splice(1, userHistory.length - 10);
    }

    logger.debug(`Updated conversation history for channel ${channelId}`);

    try {
      logger.info(`Generating AI response for message ${message.id} from ${message.author.tag}.`);
      
      const reply = await generateAIResponse(userHistory);

      if (!reply) {
        logger.warn('No reply generated from AI service.');
        await message.reply({
          content: "⚠️ I couldn't generate a response.",
          ephemeral: true
        });
        return;
      }

      logger.info(`Sending AI response (${reply.length} chars) for message ${message.id} in channel ${channelId}.`);

      const messageChunks = splitMessage(reply);
      
      try {
        if (messageChunks.length === 1) {
          await message.reply({
            content: messageChunks[0],
            ephemeral: false
          });
        } else {
          for (const chunk of messageChunks) {
            await message.reply({
              content: chunk,
              ephemeral: false
            });
          }
        }
      } catch (sendError) {
        logger.error(`Failed to send response for message ${message.id}.`, {
          error: sendError.stack,
          errorMessage: sendError.message
        });
      }

      logger.debug(`Adding AI response to conversation history for user ${userId} in channel ${channelId}.`);
      userHistory.push({
        role: 'assistant',
        content: reply
      });

      logger.info(`Reply sent successfully to ${message.author.tag} in channel: ${channelName}`);
    } catch (error) {
      logger.error('Error processing message:', {
        error: error.stack,
        message: error.message,
        userId,
        channelId
      });
      
      await message.reply({
        content: "⚠️ An error occurred while processing your request.",
        ephemeral: true
      });
    }
  },
};
