const { Events } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { splitMessage, processImageAttachments, createMessageContent, trimConversationHistory, createSystemMessage, SYSTEM_MESSAGES } = require('../utils/aiUtils');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const { maxHistoryLength, modelName } = require('../config');

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
   * Uses per-channel locking to prevent race conditions when multiple messages arrive simultaneously.
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

    // Initialize channel locks if not already present
    if (!client.channelLocks) {
      client.channelLocks = new Map();
    }

    // Get or create lock for this channel
    let channelLock = client.channelLocks.get(channelId);
    if (!channelLock) {
      channelLock = Promise.resolve();
      client.channelLocks.set(channelId, channelLock);
    }

    // Wait for previous message processing to complete, then process this message
    const processMessage = async () => {
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
        logger.debug(`Processing ${message.attachments.size} attachment(s) from message ${message.id}`);
        imageContents = await processImageAttachments(Array.from(message.attachments.values()));
        logger.info(`Processed ${imageContents.length} image(s) from message ${message.id}`);
      }

      // Check if replying to another user's message with images
      if (referencedMessage && !isReplyToBot && referencedMessage.author.id !== client.user.id) {
        if (referencedMessage.attachments && referencedMessage.attachments.size > 0) {
          const referencedImageAttachments = Array.from(referencedMessage.attachments.values()).filter(
            attachment => attachment.contentType && attachment.contentType.startsWith('image/')
          );
          
          if (referencedImageAttachments.length > 0) {
            logger.debug(`Processing ${referencedImageAttachments.length} image(s) from referenced message ${referencedMessage.id}`);
            const referencedImages = await processImageAttachments(referencedImageAttachments);
            imageContents.push(...referencedImages);
            logger.info(`Processed ${referencedImages.length} image(s) from referenced message ${referencedMessage.id}`);
          }
        }
      }

      if (!client.conversationHistory.has(channelId)) {
        logger.debug(`No conversation history found for channel ${channelId}.`);
        const systemMessage = createSystemMessage(modelName);
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
      if (imageContents.length > 0) {
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
    };

    const currentLock = channelLock.then(processMessage);
    client.channelLocks.set(channelId, currentLock);

    // Wait for this message to be processed
    await currentLock;
  },

};
