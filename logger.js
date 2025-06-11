const { createLogger, format, transports } = require('winston');
const util = require('util');
const config = require('./config');

/** Log format field names */
const LOG_FORMAT_TIMESTAMP = 'timestamp';
const LOG_FORMAT_LABEL = 'label';
const LOG_FORMAT_LEVEL = 'level';
const LOG_FORMAT_MESSAGE = 'message';

/** Template for log message format */
const LOG_FORMAT_TEMPLATE = '%s - [%s] - [%s] - %s %s';

/** Console transport identifier */
const LOG_TRANSPORT_CONSOLE = 'console';

/**
 * Creates and returns a configured Winston logger instance.
 * The logger includes timestamp, label, level, and message formatting.
 * 
 * @param {string} label - The label to identify the source of the log message
 * @returns {import('winston').Logger} Configured Winston logger instance
 */
function getLogger(label) {
  return createLogger({
    level: config.logLevel,
    format: format.combine(
      format.label({ label }),
      format.timestamp(),
      format.printf(({ timestamp, level, message, label, ...meta }) => {
        // Format the message with any additional arguments
        let formattedMessage = message;
        if (typeof message === 'string') {
          const args = meta[0];
          if (args !== undefined) {
            if (Array.isArray(args)) {
              formattedMessage = util.format(message, ...args);
            } else {
              formattedMessage = util.format(message, args);
            }
            delete meta[0];
          }
        }

        // Format the final message
        const finalMessage = util.format(
          LOG_FORMAT_TEMPLATE,
          timestamp,
          label,
          level.toUpperCase(),
          formattedMessage,
          Object.keys(meta).length ? JSON.stringify(meta) : ''
        );

        return finalMessage;
      })
    ),
    transports: [new transports.Console()]
  });
}

module.exports = getLogger;