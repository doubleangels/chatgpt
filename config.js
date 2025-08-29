require('dotenv').config();

/**
 * Application configuration object.
 * Loads environment variables with fallback values where appropriate.
 * @type {Object}
 */
const config = {
  token: process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.MODEL_NAME || 'gpt-4o-mini',
  maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH) || 10,
  logLevel: process.env.LOG_LEVEL || 'info',
};

/**
 * Checks if the current model supports vision capabilities.
 * @returns {boolean} True if the model supports vision
 */
function supportsVision() {
  return config.modelName.includes('gpt-4o') || 
         config.modelName.includes('gpt-4-vision') || 
         config.modelName.includes('gpt-4o-mini') ||
         config.modelName.startsWith('gpt-5');
}

/**
 * Gets the temperature setting for the current model.
 * @returns {number} Temperature value (0.7 for most models, 1.0 for GPT-5 models)
 */
function getTemperature() {
  return config.modelName.startsWith('gpt-5') ? 1.0 : 0.7;
}

module.exports = {
  ...config,
  supportsVision,
  getTemperature
};