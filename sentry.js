const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");
const logger = require('./logger')('sentry.js');
const config = require('./config');

/**
 * Initialize Sentry with configuration
 * Sets up error tracking, performance monitoring, and profiling
 */
function initializeSentry() {
  logger.info("Initializing Sentry...");
  
  try {
    // Initialize Sentry with the DSN and integrations
    Sentry.init({
      dsn: "https://eec36346892467255ce18e6fed4ef80d@o244019.ingest.us.sentry.io/4508717394034688",
      
      // Add profiling integration for performance monitoring
      integrations: [nodeProfilingIntegration()],
      
      // Capture all trace data in development, sample in production
      tracesSampleRate: config.environment === 'production' ? 0.2 : 1.0,
      
      // Capture all profiling data in development, sample in production
      profilesSampleRate: config.environment === 'production' ? 0.1 : 1.0,
      
      // Set environment tag
      environment: config.environment,
      
      // Add release information if available
      ...(process.env.npm_package_version ? { release: process.env.npm_package_version } : {}),
      
      // Configure beforeSend to sanitize sensitive data
      beforeSend(event) {
        // Remove sensitive data from events if needed
        return event;
      }
    });
    
    // Configure Sentry scope with default tags
    Sentry.configureScope(scope => {
      scope.setTag('botId', config.clientId);
    });
    
    logger.info("Sentry initialized successfully with performance monitoring.");
  } catch (error) {
    logger.error("Failed to initialize Sentry:", { 
      error: error.message, 
      stack: error.stack 
    });
    
    // Continue without Sentry if initialization fails
    // Return a mock Sentry object with no-op methods
    return {
      captureException: () => {},
      captureMessage: () => {},
      close: () => Promise.resolve(),
    };
  }
  
  return Sentry;
}

// Initialize Sentry and export the configured instance
const configuredSentry = initializeSentry();
module.exports = configuredSentry;
