const Sentry = require("@sentry/node");
const path = require('path');
const logger = require('./logger')(path.basename(__filename));

const SENTRY_DSN = "https://eec36346892467255ce18e6fed4ef80d@o244019.ingest.us.sentry.io/4508717394034688";
const SENTRY_TRACES_SAMPLE_RATE = 1.0;

const LOG_SENTRY_INITIALIZED = "Sentry initialized!";

// Initialize Sentry for error tracking and performance monitoring.
Sentry.init({
  dsn: SENTRY_DSN,
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
});
logger.info(LOG_SENTRY_INITIALIZED);

// Export the configured Sentry instance
module.exports = Sentry;