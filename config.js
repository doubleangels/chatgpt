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
  // Rough, token-estimated cap for stored history (in addition to maxHistoryLength).
  // If unset/invalid, token trimming is effectively disabled.
  maxHistoryTokens: parseInt(process.env.MAX_HISTORY_TOKENS, 10) || 0,
  modelName: resolvedModel,
  // Cap model output to reduce multi-message bursts & cost.
  maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS, 10) || 600,
  openaiApiKey: process.env.OPENAI_API_KEY,
  reasoningEffort: process.env.REASONING_EFFORT || 'minimal',
  responsesVerbosity: process.env.RESPONSES_VERBOSITY || 'low',
  // Basic anti-spam/cost controls (in-memory, per process).
  userCooldownMs: parseInt(process.env.USER_COOLDOWN_MS, 10) || 4000,
  channelCooldownMs: parseInt(process.env.CHANNEL_COOLDOWN_MS, 10) || 1500,
  maxPendingPerChannel: parseInt(process.env.MAX_PENDING_PER_CHANNEL, 10) || 3,
  // Image download safety limits
  imageDownloadTimeoutMs: parseInt(process.env.IMAGE_DOWNLOAD_TIMEOUT_MS, 10) || 8000,
  maxImageBytes: parseInt(process.env.MAX_IMAGE_BYTES, 10) || 6_000_000,
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