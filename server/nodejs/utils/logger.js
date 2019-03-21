'use strict';

const winston = require('winston');
const winstonRotator = require('winston-daily-rotate-file');


const env = process.env.NODE_ENV || 'development';

const tsFormat = () => (new Date()).toLocaleTimeString();

const errorLogger = new (winston.Logger)({
  transports: [
    // colorize the output to the console
    new (winston.transports.Console)({
      timestamp: tsFormat,
      colorize: true,
      level: 'warn'
    }),
    new (winstonRotator)({
      filename: 'logs/%DATE%-errors.log',
      timestamp: tsFormat,
      datePattern: 'YYYY-MM-DD',
      prepend: true,
      //level: env === 'development' ? 'verbose' : 'info'
      level: 'warn'
    })
  ]
});


//errorLogger.debug('Debugging info');
//errorLogger.verbose('Verbose info');
//errorLogger.info('Hello world');
//errorLogger.warn('Warning message');
//errorLogger.error('Error info');


module.exports = {
  'errorlog': errorLogger
};