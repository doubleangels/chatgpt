const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");
const logger = require('./logger')('sentry.js');

// Initialize Sentry for error tracking and performance monitoring.
Sentry.init({
  dsn: "https://eec36346892467255ce18e6fed4ef80d@o244019.ingest.us.sentry.io/4508717394034688",
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0, // Capture all trace data.
  profilesSampleRate: 1.0, // Capture all profiling data.
});
logger.info("Sentry initialized with performance monitoring.");

// Export the configured Sentry instance
module.exports = Sentry;