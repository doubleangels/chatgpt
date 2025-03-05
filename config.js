require('dotenv').config();

/**
 * Configuration file for the bot.
 *
 * Exports environment variables used throughout the bot's code.
 */
module.exports = {
  // Discord bot token
  token: process.env.DISCORD_BOT_TOKEN,
  // OpenAI API key
  openaiApiKey: process.env.OPENAI_API_KEY,
  // OpenAI model to use
  modelName: process.env.MODEL_NAME || 'gpt-4o-mini',
  // Maximum number of messages to keep in conversation history
  maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH || '10', 10),
  // Log level
  logLevel: process.env.LOG_LEVEL || 'info',
  // Discord client ID
  clientId: process.env.CLIENT_ID,
};