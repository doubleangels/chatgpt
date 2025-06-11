/**
 * Logger module for the Discord bot.
 * Creates and configures Winston logger instances with consistent formatting.
 * @module logger
 */

const { createLogger, format, transports } = require('winston');
const config = require('./config');

/**
 * Creates a new logger instance with the specified label.
 * @function getLogger
 * @param {string} label - The label to identify the logger instance
 * @throws {Error} If the label is invalid or logger creation fails
 * @returns {winston.Logger} A configured Winston logger instance
 */
function getLogger(label) {
  if (!label || typeof label !== 'string') {
    throw new Error('Invalid logger label provided.');
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
    throw new Error('Failed to create logger instance.');
  }
}

module.exports = getLogger;