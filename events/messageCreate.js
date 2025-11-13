const { Events, MessageType } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { splitMessage, processImageAttachments, createMessageContent, trimConversationHistory, createSystemMessage, SYSTEM_MESSAGES } = require('../utils/aiUtils');
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
   * Maintains conversation history per channel, allowing multiple users to participate.
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

    let thinkingMessage;
    try {
      thinkingMessage = await message.reply({
        content: "*Thinking...*",
        ephemeral: false
      });
    } catch (err) {
      logger.warn(`Failed to send thinking message in channel ${channelId}.`, {
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
          content: "⚠️ I received an image, but the current model doesn't support image analysis. Please use a model that has image support.",
          ephemeral: true
        });
      } else {
        logger.debug(`Processing ${message.attachments.size} attachment(s) from message ${message.id}`);
        imageContents = await processImageAttachments(Array.from(message.attachments.values()));
        logger.info(`Processed ${imageContents.length} image(s) from message ${message.id}`);
      }
    }

    if (!client.conversationHistory.has(channelId)) {
      logger.debug(`No conversation history found for channel ${channelId}.`);
      const systemMessage = createSystemMessage(modelName, supportsVision());
      client.conversationHistory.set(channelId, [systemMessage]);
      logger.info(`Created new conversation history for channel ${channelId}.`);
    }

    const channelHistory = client.conversationHistory.get(channelId);
    
    if (isReplyToBot && referencedMessage) {
      logger.debug(`Adding bot's previous response to conversation history for channel ${channelId}.`);
      channelHistory.push({
        role: 'assistant',
        content: referencedMessage.content
      });
    }

    logger.debug(`Adding user message (${message.id}) from ${message.author.tag} to conversation history for channel ${channelId}.`);
    
    const messageContent = createMessageContent(userText, imageContents);
    
    let finalMessageContent = messageContent;
    if (imageContents.length > 0 && supportsVision()) {
      if (!userText || userText.trim() === '') {
        finalMessageContent = [
          {
            type: 'input_text',
            text: SYSTEM_MESSAGES.IMAGE_DESCRIPTION_PROMPT
          },
          ...imageContents
        ];
      }
    }
    
    channelHistory.push({
      role: 'user',
      content: finalMessageContent
    });

    trimConversationHistory(channelHistory, maxHistoryLength);

    logger.debug(`Updated conversation history for channel ${channelId}`);

    try {
      logger.info(`Generating AI response for message ${message.id} from ${message.author.tag}.`);
      
      const reply = await generateAIResponse(channelHistory);

      if (!reply) {
        logger.warn('No reply generated from AI service.');
        if (thinkingMessage) {
          await thinkingMessage.edit({
            content: "⚠️ I couldn't generate a response."
          });
        } else {
          await message.reply({
            content: "⚠️ I couldn't generate a response.",
            ephemeral: true
          });
        }
        return;
      }

      logger.info(`Sending AI response (${reply.length} chars) for message ${message.id} in channel ${channelId}.`);

      const messageChunks = splitMessage(reply);
      
      try {
        if (messageChunks.length === 1) {
          if (thinkingMessage) {
            await thinkingMessage.edit({
              content: messageChunks[0]
            });
          } else {
            await message.reply({
              content: messageChunks[0],
              ephemeral: false
            });
          }
        } else {
          if (thinkingMessage) {
            await thinkingMessage.edit({
              content: messageChunks[0]
            });
          }
          
          for (let i = 1; i < messageChunks.length; i++) {
            await message.reply({
              content: messageChunks[i],
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

      logger.debug(`Adding AI response to conversation history for channel ${channelId}.`);
      channelHistory.push({
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
      
      if (thinkingMessage) {
        await thinkingMessage.edit({
          content: "⚠️ An error occurred while processing your request."
        });
      } else {
        await message.reply({
          content: "⚠️ An error occurred while processing your request.",
          ephemeral: true
        });
      }
    }
  },

};
