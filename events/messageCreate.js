const { Events, MessageType } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { splitMessage } = require('../utils/messageUtils');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const { maxHistoryLength } = require('../config');
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
    const channelName = message.channel?.name || 'DM';
    const isDM = message.channel.type === 1; // 1 = DM channel

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

    // In DMs, respond to all messages. In servers, only respond to mentions or replies
    if (!isDM && !hasBotMention && !isReplyToBot) {
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

    // In DMs, use the full message content. In servers, remove the bot mention
    const userText = isDM ? message.content.trim() : message.content.replace(botMention, '@ChatGPT').trim();

    if (!client.conversationHistory.has(channelId)) {
      logger.debug(`No conversation history found for channel ${channelId}`);
      client.conversationHistory.set(channelId, new Map());
      logger.info(`Created new conversation history for channel ${channelId}`);
    }

    const channelHistory = client.conversationHistory.get(channelId);
    if (!channelHistory.has(userId)) {
      channelHistory.set(userId, [{
        role: 'system',
        content: `You are a helpful assistant.
                    The users that you help know that you can 't send messages on their behalf.
                    Please send responses in a clear and concise manner.
                    Always limit responses to less than 2000 characters.
                    Maintain conversation continuity and context.`
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
    userHistory.push({
      role: 'user',
      content: userText
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

      const replyChunks = splitMessage(reply);
      logger.info(`Sending AI response in ${replyChunks.length} chunks for message ${message.id} in channel ${channelId}.`);

      logger.info(`Sending reply to ${message.author.tag} in channel: ${channelName}`);

      for (let i = 0; i < replyChunks.length; i++) {
        try {
          await message.reply({
            content: replyChunks[i],
            ephemeral: false
          });
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
