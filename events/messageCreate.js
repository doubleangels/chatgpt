const { Events } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { splitMessage } = require('../utils/messageUtils');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const { maxHistoryLength } = require('../config');
const Sentry = require('../sentry');

module.exports = {
  name: Events.MessageCreate,
  /**
   * Executes when a message is created in Discord.
   * Processes messages that mention the bot or reply to the bot.
   * 
   * @param {Message} message - The Discord message object.
   */
  async execute(message) {
    // Ignore messages from bots to prevent loops.
    if (message.author.bot) return;

    const client = message.client;
    const botMention = `<@${client.user.id}>`;
    const channelId = message.channelId;
    const userId = message.author.id;
    const channelName = message.channel?.name || 'unknown';

    // Check if this is a reply to the bot.
    let isReplyToBot = false;
    let referencedMessage = null;

    // Process message reference (if it's a reply).
    if (message.reference && message.reference.messageId) {
      try {
        // Fetch the message being replied to.
        referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
        isReplyToBot = referencedMessage.author.id === client.user.id;

        if (isReplyToBot) {
          logger.debug(`Message ${message.id} is a reply to bot's message: ${referencedMessage.id}.`);
        }
      } catch (error) {
        Sentry.captureException(error, {
          extra: {
            context: 'fetching_referenced_message',
            messageId: message.id,
            referenceId: message.reference.messageId,
            channelId
          }
        });

        logger.error(`Failed to fetch referenced message ${message.reference.messageId}.`, {
          error: error.stack,
          messageId: message.id,
          errorMessage: error.message
        });
      }
    }

    // Check if the bot should process this message - only respond to mentions or replies.
    const hasBotMention = message.content.includes(botMention);

    // Process only if the bot is mentioned or is a reply to the bot.
    if (!hasBotMention && !isReplyToBot) {
      return;
    }

    // Start typing indicator to show the bot is processing.
    try {
      await message.channel.sendTyping();
    } catch (err) {
      logger.warn(`Failed to send typing indicator in channel ${channelId}.`, {
        errorMessage: err.message,
        channelId
      });
    }

    logger.info(`Bot triggered by ${message.author.tag} in #${channelName}.`, {
      userId,
      channelId,
      guildId: message.guild?.id,
      messageId: message.id,
      hasMention: hasBotMention,
      isReply: isReplyToBot
    });

    // Process user message - replace bot mention with a generic name.
    const userText = message.content.replace(botMention, '@ChatGPT').trim();

    // Initialize conversation history for this channel if it doesn't exist.
    if (!client.conversationHistory.has(channelId)) {
      logger.info(`Initializing new conversation history for channel #${channelName} (${channelId}).`);
      client.conversationHistory.set(channelId, new Map());
    }

    const channelHistory = client.conversationHistory.get(channelId);
    // Initialize user history if it doesn't exist.
    if (!channelHistory.has(userId)) {
      channelHistory.set(userId, [
        {
          role: 'system',
          content: `You are a helpful assistant.
                    The users that you help know that you can't send messages on their behalf.
                    Please send responses in a clear and concise manner, using Discord message formatting.
                    Limit responses to less than 2000 characters.
                    Maintain conversation continuity and context.`
        }
      ]);
    }

    // Get conversation history for the user.
    const userHistory = channelHistory.get(userId);
    // Add referenced message to history if replying to bot.
    if (isReplyToBot && referencedMessage) {
      logger.debug(`Adding bot's previous response to conversation history for user ${userId} in channel ${channelId}.`);
      userHistory.push({
        role: 'assistant',
        content: referencedMessage.content
      });
    }

    // Add user message to history.
    logger.debug(`Adding user message (${message.id}) to conversation history for user ${userId}.`);
    userHistory.push({
      role: 'user',
      content: userText
    });

    // Ensure history doesn't exceed maximum length.
    if (userHistory.length > maxHistoryLength + 1) { // +1 for system message
      logger.debug(`Trimming conversation history for user ${userId} in channel ${channelId} (current: ${userHistory.length}, max: ${maxHistoryLength + 1}).`);

      while (userHistory.length > maxHistoryLength + 1) {
        if (userHistory[0].role === 'system') {
          // Skip the system message.
          if (userHistory.length > 1) {
            userHistory.splice(1, 1);
          }
        } else {
          userHistory.shift();
        }
      }
    }

    try {
      // Generate AI response.
      logger.info(`Generating AI response for message ${message.id} from ${message.author.tag}.`);
      const reply = await generateAIResponse(userHistory);

      if (!reply) {
        logger.warn(`Failed to generate AI response for message ${message.id} in channel ${channelId}.`);
        await message.reply({
          content: "⚠️ I couldn't generate a response.",
          ephemeral: true
        });
        return;
      }

      // Split response if needed and send.
      const chunks = splitMessage(reply);
      logger.info(`Sending AI response in ${chunks.length} chunks for message ${message.id} in channel ${channelId}.`);

      for (let i = 0; i < chunks.length; i++) {
        try {
          if (i === 0) {
            // First chunk is sent as a reply to maintain context.
            await message.reply({
              content: chunks[i],
              ephemeral: false
            });
          } else {
            // Additional chunks are sent as follow-up messages.
            await message.channel.send({
              content: chunks[i],
              ephemeral: false
            });
          }
        } catch (sendError) {
          Sentry.captureException(sendError, {
            extra: {
              context: 'sending_message_chunk',
              messageId: message.id,
              chunkIndex: i,
              totalChunks: chunks.length,
              channelId,
              userId
            }
          });
          
          logger.error(`Failed to send message chunk ${i + 1} for message ${message.id}.`, {
            error: sendError.stack,
            chunk: i + 1,
            totalChunks: chunks.length,
            errorMessage: sendError.message
          });
        }
      }

      // Add AI response to history.
      logger.debug(`Adding AI response to conversation history for user ${userId} in channel ${channelId}.`);
      userHistory.push({
        role: 'assistant',
        content: reply
      });

    } catch (error) {
      // Log, track errors with Sentry, and inform the user.
      Sentry.captureException(error, {
        extra: {
          context: 'processing_message',
          messageId: message.id,
          userId,
          channelId,
          guildId: message.guild?.id
        }
      });
      
      logger.error(`Error processing message ${message.id}.`, {
        error: error.stack,
        userId,
        channelId,
        errorMessage: error.message
      });
      
      // Send error message to user.
      await message.reply({
        content: "⚠️ An error occurred while processing your request.",
        ephemeral: true
      });
    }
  },
};
