const { Events, MessageType } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { splitMessage } = require('../utils/messageUtils');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const { maxHistoryLength } = require('../config');
const config = require('../config');

/**
 * Message types that the bot will respond to
 * @type {Object}
 */
const MESSAGE_TYPES = {
  DEFAULT: MessageType.Default,
  REPLY: MessageType.Reply
};

// Log message constants
const LOG_MESSAGE_RECEIVED = 'Message received from %s in %s: %s';
const LOG_PROCESSING_MESSAGE = 'Processing message from %s in %s';
const LOG_MESSAGE_IGNORED = 'Ignoring message from %s (bot)';
const LOG_MESSAGE_TYPE_IGNORED = 'Ignoring message of type: %s';
const LOG_NO_HISTORY = 'No conversation history found for channel %s';
const LOG_HISTORY_CREATED = 'Created new conversation history for channel %s';
const LOG_HISTORY_UPDATED = 'Updated conversation history for channel %s';
const LOG_SENDING_REPLY = 'Sending reply to %s in %s';
const LOG_REPLY_SENT = 'Reply sent successfully to %s in %s';
const LOG_ERROR_PROCESSING = 'Error processing message:';
const LOG_ERROR_SENDING = 'Error sending reply:';

/**
 * Configuration for conversation history and system message
 * @type {Object}
 */
const MESSAGE_CONFIG = {
  maxHistoryLength: 10,
  systemMessage: {
    role: 'system',
    content: 'You are a helpful assistant.'
  }
};

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
      logger.debug(LOG_MESSAGE_IGNORED, message.author.tag);
      return;
    }

    if (message.type !== MESSAGE_TYPES.DEFAULT) {
      logger.debug(LOG_MESSAGE_TYPE_IGNORED, message.type);
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

    logger.info(LOG_MESSAGE_RECEIVED, message.author.tag, channelName, message.content);
    logger.debug(LOG_PROCESSING_MESSAGE, message.author.tag, channelName);

    const userText = message.content.replace(botMention, '@ChatGPT').trim();

    if (!client.conversationHistory.has(channelId)) {
      logger.debug(LOG_NO_HISTORY, channelId);
      client.conversationHistory.set(channelId, new Map());
      logger.info(LOG_HISTORY_CREATED, channelId);
    }

    const channelHistory = client.conversationHistory.get(channelId);
    if (!channelHistory.has(userId)) {
      channelHistory.set(userId, [MESSAGE_CONFIG.systemMessage]);
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
    userHistory.push({
      role: 'user',
      content: userText
    });

    if (userHistory.length > MESSAGE_CONFIG.maxHistoryLength) {
      logger.debug(`Trimming conversation history for user ${userId} in channel ${channelId} (current: ${userHistory.length}, max: ${MESSAGE_CONFIG.maxHistoryLength}).`);
      userHistory.splice(1, userHistory.length - MESSAGE_CONFIG.maxHistoryLength);
    }

    logger.debug(LOG_HISTORY_UPDATED, channelId);

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

      const replyChunks = splitMessage(reply);
      logger.info(`Sending AI response in ${replyChunks.length} chunks for message ${message.id} in channel ${channelId}.`);

      logger.info(LOG_SENDING_REPLY, message.author.tag, channelName);

      for (let i = 0; i < replyChunks.length; i++) {
        try {
          if (i === 0) {
            await message.reply({
              content: replyChunks[i],
              ephemeral: false
            });
          } else {
            await message.channel.send({
              content: replyChunks[i],
              ephemeral: false
            });
          }
        } catch (sendError) {
          logger.error(`Failed to send message chunk ${i + 1} for message ${message.id}.`, {
            error: sendError.stack,
            chunk: i + 1,
            totalChunks: replyChunks.length,
            errorMessage: sendError.message
          });
        }
      }

      logger.debug(`Adding AI response to conversation history for user ${userId} in channel ${channelId}.`);
      userHistory.push({
        role: 'assistant',
        content: reply
      });

      logger.info(LOG_REPLY_SENT, message.author.tag, channelName);
    } catch (error) {
      logger.error(LOG_ERROR_PROCESSING, {
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
