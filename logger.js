const { createLogger, format, transports } = require('winston');
const config = require('./config');

// Log format configuration
const LOG_FORMAT_TIMESTAMP = 'timestamp';
const LOG_FORMAT_LABEL = 'label';
const LOG_FORMAT_LEVEL = 'level';
const LOG_FORMAT_MESSAGE = 'message';

// Log format template
const LOG_FORMAT_TEMPLATE = '%s - [%s] - [%s] - %s %s';

// Transport configuration
const LOG_TRANSPORT_CONSOLE = 'console';

/**
 * Returns a configured Winston logger with the specified label.
 *
 * @param {string} label - The label to associate with log messages.
 * @returns {Logger} A Winston logger instance.
 */
function getLogger(label) {
  return createLogger({
    level: config.logLevel, // Set the log level from the config (e.g., 'debug', 'info').
    format: format.combine(
      // Attach a label to each log message.
      format.label({ label }),
      // Add a timestamp to each log message.
      format.timestamp(),
      // Define the log message format.
      format.printf(({ timestamp, level, message, label, ...meta }) => {
        // Build the log message string with timestamp, label, level, message, and additional metadata (if any).
        return LOG_FORMAT_TEMPLATE.replace('%s', timestamp)
          .replace('%s', label)
          .replace('%s', level.toUpperCase())
          .replace('%s', message)
          .replace('%s', Object.keys(meta).length ? JSON.stringify(meta) : '');
      })
    ),
    // Output log messages to the console.
    transports: [new transports.Console()]
  });
}

module.exports = getLogger;