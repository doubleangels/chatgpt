const { createLogger, format, transports } = require('winston');
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
        return LOG_FORMAT_TEMPLATE.replace('%s', timestamp)
          .replace('%s', label)
          .replace('%s', level.toUpperCase())
          .replace('%s', message)
          .replace('%s', Object.keys(meta).length ? JSON.stringify(meta) : '');
      })
    ),
    transports: [new transports.Console()]
  });
}

module.exports = getLogger;