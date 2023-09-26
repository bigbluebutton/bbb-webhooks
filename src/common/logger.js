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

addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  verbose: 'cyan',
  debug: 'magenta',
  trace: 'gray'
});

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
  debug: 4,
  trace: 5,
};

const shimmerLoggerWithLabel = (logger, label) => {
  const shimmeredLogger = Object.assign({}, logger);
  Object.keys(LEVELS).forEach((level) => {
    shimmeredLogger[level] = (message, meta) => {
      logger[level](`[${label}] ${message}`, meta);
    }
  });

  return shimmeredLogger;
};

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

const logger = shimmerLoggerWithLabel(BASE_LOGGER, 'bbb-webhooks');

const newLogger = (label) => {
  return shimmerLoggerWithLabel(BASE_LOGGER, label);
}

export default logger;

export {
  newLogger,
};
