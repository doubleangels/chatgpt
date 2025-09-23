/**
 * Centralized configuration and helpers for model capabilities.
 * @module config
 */
require('dotenv').config();

/**
 * Application configuration object.
 * Loads environment variables with fallback values where appropriate.
 * @type {Object}
 */
/** @type {{
 *   token: string|undefined,
 *   clientId: string|undefined,
 *   openaiApiKey: string|undefined,
 *   modelName: string,
 *   maxHistoryLength: number,
 *   logLevel: string
 * }}
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
/**
 * Whether the configured model supports image inputs.
 * @returns {boolean}
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
/**
 * Returns the default sampling temperature for the configured model.
 * @returns {number}
 */
function getTemperature() {
  return config.modelName.startsWith('gpt-5') ? 1.0 : 0.7;
}

module.exports = {
  ...config,
  supportsVision,
  getTemperature
};