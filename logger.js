const { createLogger, format, transports } = require('winston');
const config = require('./config');

function getLogger(label) {
  return createLogger({
    level: config.logLevel,
    format: format.combine(
      format.label({ label }),
      format.timestamp(),
      format.printf(({ timestamp, level, message, label, ...meta }) => {
        return `${timestamp} - [${label}] - [${level.toUpperCase()}] - ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
      })
    ),
    transports: [new transports.Console()]
  });
}

module.exports = getLogger;