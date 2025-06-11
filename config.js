require('dotenv').config();

/**
 * Application configuration object.
 * Loads environment variables with fallback values where appropriate.
 * @type {Object}
 */
module.exports = {
  /** Discord bot token for authentication */
  token: process.env.DISCORD_BOT_TOKEN,
  /** Discord application client ID */
  clientId: process.env.DISCORD_CLIENT_ID,
  /** OpenAI API key for AI model access */
  openaiApiKey: process.env.OPENAI_API_KEY,
  /** OpenAI model name to use (defaults to gpt-4o-mini) */
  modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
  /** Maximum number of messages to keep in conversation history (defaults to 10) */
  maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH) || 10,
  /** Logging level for the application (defaults to 'info') */
  logLevel: process.env.LOG_LEVEL || 'info',
};