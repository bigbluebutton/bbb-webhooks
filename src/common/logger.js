'use strict';

import { addColors, format, createLogger, transports } from 'winston';
import config from 'config';
import jsonStringify from 'safe-stable-stringify';

const LOG_CONFIG = config.get('log') || {};
const {
  level: DEFAULT_LEVEL,
  filename: DEFAULT_FILENAME,
  stdout: STDOUT = true
} = LOG_CONFIG;
const { combine, colorize, timestamp, json, printf, errors, splat } = format;
const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
  debug: 4,
  trace: 5,
};
addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  verbose: 'cyan',
  debug: 'magenta',
  trace: 'gray'
});

/**
 * The logging library used by this module.
 * @name external:winston
 * @external winston
 * @private
 */

/**
 * The logging class exposed by this module.
 * @name external:winston.Logger
 * @memberof external:winston
 * @external winston.Logger
 * @class
 */

/**
 * Method to log a message at a specified level.
 * @name external:winston.Logger#log
 * @memberof external:winston.Logger
 * @function
 * @param {string} level - The log level to use.
 * @param {string} message - The message to log.
 */

/**
 * @typedef {object} BbbWebhooksLogger
 * @property {external:winston.Logger#log} error - log a message at the error level
 * @property {external:winston.Logger#log} warn - log a message at the warn level
 * @property {external:winston.Logger#log} info - log a message at the info level
 * @property {external:winston.Logger#log} verbose - log a message at the verbose level
 * @property {external:winston.Logger#log} debug - log a message at the debug level
 * @property {external:winston.Logger#log} trace - log a message at the trace level
 */

/**
 * _shimmerLoggerWithLabel.
 * @private
 * @param {external:winston.Logger} logger - the logger to be shimmered
 * @param {string} label - the label to be prepended to the message
 * @returns {BbbWebhooksLogger} the shimmered logger
 */
const _shimmerLoggerWithLabel = (logger, label) => {
  const shimmeredLogger = Object.assign({}, logger);
  Object.keys(LEVELS).forEach((level) => {
    /**
     * shimmeredLogger[level].
     * @param {object} message - the message to be logged
     * @param {string} meta - loggable object to be stringified and appended to the message (metadata)
     */
    shimmeredLogger[level] = (message, meta) => {
      logger.log(level, `[${label}] ${message}`, meta);
    }
  });

  return shimmeredLogger;
};

/**
 * @typedef {object} LoggerOptions
 * @property {string} filename - the filename to log to
 * @property {string} level - the maximum log level to use
 * @property {boolean} stdout - whether to log to stdout
 */

/**
 * _newLogger.
 * @private
 * @param {LoggerOptions} options - the options to be used when creating the logger
 * @returns {external:winston.Logger} a Winston logger instance
 */
const _newLogger = ({
  filename,
  level,
  stdout,
}) => {
  const loggingTransports = [];

  if (stdout) {
    if (process.env.NODE_ENV !== 'production') {
      // Development logging - fancier, more human readable stuff
      loggingTransports.push(new transports.Console({
        format: combine(
          colorize(),
          timestamp(),
          errors({ stack: true }),
          printf(({ level, message, timestamp, ...meta}) => {
            const stringifiedRest = jsonStringify(Object.assign({}, meta, {
              splat: undefined
            }));

            if (stringifiedRest !== '{}') {
              return `${timestamp} - ${level}: ${message} ${stringifiedRest}`;
            } else {
              return `${timestamp} - ${level}: ${message}`;
            }
          }),
        )
      }));
    } else {
      loggingTransports.push(new transports.Console({
        format: combine(
          timestamp(),
          splat(),
          json(),
          errors({ stack: true }),
        )
      }));
    }
  }

  const logger = createLogger({
    levels: LEVELS,
    level,
    transports: loggingTransports,
    exitOnError: false,
  });

  logger.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.error("Logger failure", error);
  });

  return logger;
}

const BASE_LOGGER = _newLogger({
  filename: DEFAULT_FILENAME,
  level: DEFAULT_LEVEL,
  stdout: STDOUT,
});

/**
 * The default logger instance for bbb-webhooks (with label 'bbb-webhooks')
 * @name logger
 * @instance
 * @public
 * @type {BbbWebhooksLogger}
 */
const logger = _shimmerLoggerWithLabel(BASE_LOGGER, 'bbb-webhooks');
/**
 * Creates a new logger with the specified label prepended to all messages
 * @name newLogger
 * @instance
 * @function
 * @public
 * @param {string} label - the label to be prepended to the message
 * @returns {BbbWebhooksLogger} the new logger
 */
const newLogger = (label) => {
  return _shimmerLoggerWithLabel(BASE_LOGGER, label);
}

export default logger;

export {
  newLogger,
};
