require('dotenv').config();

const SUPPORTED_MODELS = ['gpt-5', 'gpt-5-nano', 'gpt-5-mini'];
const DEFAULT_MODEL = 'gpt-5-nano';

const envModel = (process.env.MODEL_NAME || '').trim();
let resolvedModel = DEFAULT_MODEL;

if (!envModel) {
  resolvedModel = DEFAULT_MODEL;
} else if (SUPPORTED_MODELS.includes(envModel)) {
  resolvedModel = envModel;
} else {
  console.warn(
    `Unsupported MODEL_NAME "${envModel}" provided. Falling back to default "${DEFAULT_MODEL}". ` +
    `Supported models: ${SUPPORTED_MODELS.join(', ')}.`
  );
  resolvedModel = DEFAULT_MODEL;
}

/**
 * Application configuration object.
 * Loads environment variables with fallback values where appropriate.
 * @type {Object}
 */
const config = {
  clientId: process.env.DISCORD_CLIENT_ID,
  logLevel: process.env.LOG_LEVEL || 'info',
  maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH, 10) || 20,
  modelName: resolvedModel,
  openaiApiKey: process.env.OPENAI_API_KEY,
  reasoningEffort: process.env.REASONING_EFFORT || 'minimal',
  responsesVerbosity: process.env.RESPONSES_VERBOSITY || 'low',
  token: process.env.DISCORD_BOT_TOKEN,
};

/**
 * Gets the temperature setting for the current model.
 * @returns {number} Temperature value (0.7 for most models, 1.0 for GPT-5 models)
 */
function getTemperature() {
  return 1.0;
}

module.exports = {
  ...config,
  SUPPORTED_MODELS,
  getTemperature
};