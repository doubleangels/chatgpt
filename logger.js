const { createLogger, format, transports } = require('winston');
const config = require('./config');

const LOG_FORMAT_TIMESTAMP = 'timestamp';
const LOG_FORMAT_LABEL = 'label';
const LOG_FORMAT_LEVEL = 'level';
const LOG_FORMAT_MESSAGE = 'message';

const LOG_FORMAT_TEMPLATE = '%s - [%s] - [%s] - %s %s';

const LOG_TRANSPORT_CONSOLE = 'console';

/**
 * Returns a configured Winston logger with the specified label.
 *
 * @param {string} label - The label to associate with log messages.
 * @returns {Logger} A Winston logger instance.
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