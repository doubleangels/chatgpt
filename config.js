require('dotenv').config();

/**
 * Configuration file for the bot.
 *
 * Exports environment variables used throughout the bot's code.
 */
module.exports = {
  token: process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
  maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH) || 10,
  logLevel: process.env.LOG_LEVEL || 'info',
};