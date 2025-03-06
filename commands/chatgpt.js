const { SlashCommandBuilder } = require('discord.js');
const { generateAIResponse } = require('../utils/aiService');
const { splitMessage } = require('../utils/messageUtils');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const { maxHistoryLength } = require('../config');
const Sentry = require('../sentry');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chatgpt')
    .setDescription('Ask ChatGPT a question.')
    .addStringOption(option => 
      option.setName('prompt')
        .setDescription('What is your question or prompt for ChatGPT?')
        .setRequired(true)),
  
  /**
   * Executes the ChatGPT slash command
   * Processes the user's prompt and generates an AI response
   * 
   * @param {Interaction} interaction - The Discord interaction object
   */
  async execute(interaction) {
    const client = interaction.client;
    const prompt = interaction.options.getString('prompt');
    
    // Defer reply to show the bot is processing
    await interaction.deferReply();
    
    logger.info(`ChatGPT command used by ${interaction.user.tag} (${interaction.user.id}) in #${interaction.channel.name} (${interaction.channel.id}).`, {
      userId: interaction.user.id,
      channelId: interaction.channel.id,
      guildId: interaction.guild?.id,
      interactionId: interaction.id
    });
    
    // Initialize conversation history for this channel if it doesn't exist
    if (!client.conversationHistory.has(interaction.channelId)) {
      logger.info(`Initializing new conversation history for channel #${interaction.channel.name} (${interaction.channelId}).`);
      
      client.conversationHistory.set(interaction.channelId, [
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
    
    // Get conversation history for this channel
    const conversationHistory = client.conversationHistory.get(interaction.channelId);
    
    // Add user message to history
    logger.debug(`Adding user prompt from interaction (${interaction.id}) to conversation history for channel ${interaction.channelId}.`);
    conversationHistory.push({
      role: 'user',
      content: prompt
    });
    
    // Ensure history doesn't exceed maximum length
    // Keep the system message and trim older messages
    if (conversationHistory.length > maxHistoryLength + 1) { // +1 for system message
      logger.debug(`Trimming conversation history for channel ${interaction.channelId} (current: ${conversationHistory.length}, max: ${maxHistoryLength + 1}).`);
      
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
      logger.info(`Generating AI response for interaction ${interaction.id} from ${interaction.user.tag} (${interaction.user.id}).`);
      const reply = await generateAIResponse(conversationHistory);
      
      if (!reply) {
        logger.warn(`Failed to generate AI response for interaction ${interaction.id} in channel ${interaction.channelId}.`);
        await interaction.editReply("⚠️ I couldn't generate a response.");
        return;
      }
      
      // Split response if needed and send
      const chunks = splitMessage(reply);
      logger.info(`Sending AI response in ${chunks.length} chunks for interaction ${interaction.id} in channel ${interaction.channelId}.`);
      
      if (chunks.length === 1) {
        // Single chunk response
        await interaction.editReply(chunks[0]);
      } else {
        // Multi-chunk response
        await interaction.editReply(chunks[0]);
        
        // Send additional chunks as follow-up messages
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp(chunks[i]);
        }
      }
      
      // Add AI response to history
      logger.debug(`Adding AI response to conversation history for channel ${interaction.channelId}.`);
      conversationHistory.push({
        role: 'assistant',
        content: reply
      });
      
    } catch (error) {
      // Log and track errors
      logger.error(`Error processing interaction ${interaction.id}: ${error.message}`, {
        error: error.stack,
        userId: interaction.user.id,
        channelId: interaction.channel.id
      });
      
      Sentry.captureException(error, {
        extra: {
          context: 'chatgptCommand',
          interactionId: interaction.id,
          userId: interaction.user.id,
          channelId: interaction.channel.id
        }
      });
      
      // Send error message to user
      await interaction.editReply("⚠️ An error occurred while processing your request.");
    }
  },
};
