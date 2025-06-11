/**
 * Logger module for the Discord bot.
 * Creates and configures Winston logger instances with consistent formatting.
 * @module logger
 */

const { createLogger, format, transports } = require('winston');
const config = require('./config');

/**
 * Error messages specific to logger operations.
 * @type {Object}
 */
const ERROR_MESSAGES = {
    UNEXPECTED_ERROR: "⚠️ An unexpected error occurred in the logger.",
    INVALID_LABEL: "⚠️ Invalid logger label provided.",
    LOGGER_CREATION_FAILED: "⚠️ Failed to create logger instance.",
    INVALID_LOG_LEVEL: "⚠️ Invalid log level provided.",
    TRANSPORT_CREATION_FAILED: "⚠️ Failed to create logger transport.",
    FORMAT_CONFIGURATION_FAILED: "⚠️ Failed to configure logger format.",
    INVALID_MESSAGE: "⚠️ Invalid log message provided.",
    INVALID_METADATA: "⚠️ Invalid log metadata provided.",
    LOG_WRITE_FAILED: "⚠️ Failed to write log message.",
    CONFIG_MISSING: "⚠️ Required logger configuration missing."
};

/**
 * Creates a new logger instance with the specified label.
 * @function getLogger
 * @param {string} label - The label to identify the logger instance
 * @throws {Error} If the label is invalid or logger creation fails
 * @returns {winston.Logger} A configured Winston logger instance
 */
function getLogger(label) {
  if (!label || typeof label !== 'string') {
    throw new Error(ERROR_MESSAGES.INVALID_LABEL);
  }

  try {
    return createLogger({
      level: config.logLevel,
      format: format.combine(
        format.label({ label }),
        format.timestamp(),
        format.printf(({ timestamp, level, message, label, ...meta }) => {
          // Handle format specifiers in the message
          let formattedMessage = message;
          if (meta && meta.args && Array.isArray(meta.args)) {
            formattedMessage = message.replace(/%[sd]/g, () => meta.args.shift());
          }
          return `${timestamp} - [${label}] - [${level.toUpperCase()}] - ${formattedMessage} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      ),
      transports: [new transports.Console()]
    });
  } catch (error) {
    console.error('Failed to create logger:', error);
    throw new Error(ERROR_MESSAGES.LOGGER_CREATION_FAILED);
  }
}

module.exports = getLogger;