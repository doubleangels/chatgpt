require('dotenv').config();

/**
 * Configuration object containing all settings for the application
 * Values are loaded from environment variables with fallbacks for optional settings
 */
const config = {
  // Discord bot token - required for authentication with Discord API
  token: process.env.DISCORD_BOT_TOKEN,
  
  // OpenAI API key - required for AI functionality
  openaiApiKey: process.env.OPENAI_API_KEY,
  
  // OpenAI model to use - defaults to gpt-4o-mini if not specified
  modelName: process.env.MODEL_NAME || 'gpt-4o-mini',
  
  // Log level - controls verbosity of logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Maximum number of messages to keep in conversation history
  maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH || '10', 10),
  
  // Discord client ID - required for registering slash commands
  clientId: process.env.CLIENT_ID,
  
  // Optional environment flag - can be used to adjust behavior based on environment
  environment: process.env.NODE_ENV || 'development',
};

// Validate required configuration values
const requiredVars = ['token', 'openaiApiKey', 'clientId'];
const missingVars = requiredVars.filter(varName => !config[varName]);

if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please check your .env file or environment configuration.');
  process.exit(1);
}

module.exports = config;
