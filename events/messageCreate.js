const { Events, Collection } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { splitMessage, processGifUrls } = require('../utils/messageUtils');
const logger = require('../logger')('events/messageCreate.js');
const { maxHistoryLength } = require('../config');
const Sentry = require('../sentry');

module.exports = {
  name: Events.MessageCreate,
  /**
   * Executes when a message is created in Discord
   * Processes messages that mention the bot or reply to the bot
   * 
   * @param {Message} message - The Discord message object
   */
  async execute(message) {
    // Ignore messages from bots to prevent loops
    if (message.author.bot) return;
    
    const client = message.client;
    const botMention = `<@${client.user.id}>`;
    
    // Check if this is a reply to the bot
    let isReplyToBot = false;
    let referencedMessage = null;
    
    // Process message reference (if it's a reply)
    if (message.reference && message.reference.messageId) {
      try {
        // Fetch the message being replied to
        referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
        isReplyToBot = referencedMessage.author.id === client.user.id;
        
        if (isReplyToBot) {
          logger.debug(`Message is a reply to bot's message: ${referencedMessage.id}`);
        }
      } catch (error) {
        logger.error(`Failed to fetch referenced message: ${error.message}`);
        Sentry.captureException(error, {
          extra: {
            context: 'fetchReferencedMessage',
            messageId: message.id,
            referenceId: message.reference.messageId
          }
        });
      }
    }
    
    // Check if the bot should process this message
    const hasBotMention = message.content.includes(botMention);
    const hasAttachments = message.attachments.size > 0;
    
    // Process only if the bot is mentioned, is a reply to the bot, or has attachments
    if (!hasBotMention && !isReplyToBot && !hasAttachments) {
      return;
    }
    
    // Start typing indicator to show the bot is processing
    await message.channel.sendTyping().catch(err => {
      logger.warn(`Failed to send typing indicator: ${err.message}`);
    });
    
    logger.info(`Bot triggered by ${message.author.tag} in #${message.channel.name}`, {
      userId: message.author.id,
      channelId: message.channel.id,
      guildId: message.guild?.id,
      hasMention: hasBotMention,
      isReply: isReplyToBot,
      hasAttachments: hasAttachments
    });
    
    // Process user message - replace bot mention with a generic name
    const userText = message.content.replace(botMention, '@ChatGPT').trim();
    
    // Process image attachments
    const imageUrls = [];
    message.attachments.forEach(attachment => {
      if (attachment.contentType && attachment.contentType.startsWith('image/')) {
        imageUrls.push(attachment.url);
        logger.debug(`Processing image attachment: ${attachment.url}`);
      }
    });
    
    // Process GIFs from links in the message
    const gifUrls = await processGifUrls(userText);
    imageUrls.push(...gifUrls);
    
    // Prepare user message parts for OpenAI API
    const userMessageParts = [];
    
    // Add text content if not empty
    if (userText) {
      userMessageParts.push({ type: 'text', text: userText });
    }
    
    // Add image URLs
    imageUrls.forEach(url => {
      userMessageParts.push({ type: 'image_url', image_url: { url } });
    });
    
    // Initialize conversation history for this channel if it doesn't exist
    if (!client.conversationHistory.has(message.channelId)) {
      logger.info(`Initializing new conversation history for channel ${message.channel.name}`);
      
      client.conversationHistory.set(message.channelId, [
        {
          role: 'system',
          content: `You are a helpful assistant that can analyze text, images, videos, and GIFs.
                   The users that you help know that you can't send messages on their behalf.
                   Please send responses in a clear and concise manner, using Discord message formatting.
                   Limit responses to less than 2000 characters.
                   Maintain conversation continuity and context.`
        }
      ]);
    }
    
    // Get conversation history for this channel
    const conversationHistory = client.conversationHistory.get(message.channelId);
    
    // Add referenced message to history if replying to bot
    if (isReplyToBot && referencedMessage) {
      logger.debug(`Adding bot's previous response to conversation history`);
      conversationHistory.push({
        role: 'assistant',
        content: referencedMessage.content
      });
    }
    
    // Add user message to history
    logger.debug(`Adding user message to conversation history`);
    conversationHistory.push({
      role: 'user',
      content: userMessageParts
    });
    
    // Ensure history doesn't exceed maximum length
    // Keep the system message and trim older messages
    if (conversationHistory.length > maxHistoryLength + 1) { // +1 for system message
      logger.debug(`Trimming conversation history (current: ${conversationHistory.length}, max: ${maxHistoryLength + 1})`);
      
      while (conversationHistory.length > maxHistoryLength + 1) {
        if (conversationHistory[0].role === 'system') {
          // Skip the system message
          if (conversationHistory.length > 1) {
            conversationHistory.splice(1, 1);
          }
        } else {
          conversationHistory.shift();
        }
      }
    }
    
    try {
      // Generate AI response
      logger.info(`Generating AI response for message from ${message.author.tag}`);
      const reply = await generateAIResponse(conversationHistory);
      
      if (!reply) {
        logger.warn(`Failed to generate AI response for message ${message.id}`);
        await message.reply("⚠️ I couldn't generate a response.");
        return;
      }
      
      // Split response if needed and send
      const chunks = splitMessage(reply);
      logger.info(`Sending AI response in ${chunks.length} chunks`);
      
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) {
          // First chunk is sent as a reply to maintain context
          await message.reply(chunks[i]);
        } else {
          // Additional chunks are sent as follow-up messages
          await message.channel.send(chunks[i]);
        }
      }
      
      // Add AI response to history
      logger.debug(`Adding AI response to conversation history`);
      conversationHistory.push({
        role: 'assistant',
        content: reply
      });
      
    } catch (error) {
      // Log and track errors
      logger.error(`Error processing message: ${error.message}`, {
        stack: error.stack,
        messageId: message.id
      });
      
      Sentry.captureException(error, {
        extra: {
          context: 'messageProcessing',
          messageId: message.id,
          userId: message.author.id,
          channelId: message.channel.id
        }
      });
      
      // Send error message to user
      await message.reply("⚠️ An error occurred while processing your request.");
    }
  },
};
