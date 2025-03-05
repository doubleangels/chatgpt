require('dotenv').config();

/**
 * Configuration file for the bot.
 *
 * Exports environment variables used throughout the bot's code.
 */
module.exports = {
  // Discord bot token
  token: process.env.DISCORD_BOT_TOKEN,
  // Discord application client ID
  clientId: process.env.DISCORD_CLIENT_ID,
  // OpenAI API key
  openaiApiKey: process.env.OPENAI_API_KEY,
  // OpenAI model name
  modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
  // Maximum length of conversation history to send to OpenAI
  maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH) || 10,
  // Logging level; defaults to 'info' if not set
  logLevel: process.env.LOG_LEVEL || 'info',
};