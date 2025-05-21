const Sentry = require("@sentry/node");
const path = require('path');
const logger = require('./logger')(path.basename(__filename));

// Initialize Sentry for error tracking and performance monitoring.
Sentry.init({
  dsn: "https://eec36346892467255ce18e6fed4ef80d@o244019.ingest.us.sentry.io/4508717394034688",
  tracesSampleRate: 1.0,
});
logger.info("Sentry initialized!");

// Export the configured Sentry instance
module.exports = Sentry;