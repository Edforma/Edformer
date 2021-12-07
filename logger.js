const winston = require('winston');


winston.add(new winston.transports.File({ filename: `./logs/${new Date().toISOString()}.log` })) // Log to a file

// If we are not in production, log to console with a readable format.
// TODO: Make this work
if (process.env.NODE_ENV !== 'production') {
  winston.add(new winston.transports.Console({
    format: winston.format.cli(),
  }));
  winston.info(`Running in non-production env "${process.env.NODE_ENV}". Console output enabled.`)
}

winston.info('Logger initialized.');

module.exports = winston;