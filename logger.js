const { createLogger, format, transports } = require('winston');
const config = require('./config');

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
        return `${timestamp} - [${label}] - [${level.toUpperCase()}] - ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
      })
    ),
    // Output log messages to the console.
    transports: [new transports.Console()]
  });
}

module.exports = getLogger;
