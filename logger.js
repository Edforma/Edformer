const winston = require('winston');


winston.add(new winston.transports.File({ filename: `./logs/${new Date().toISOString()}.log` })) // Log to a file

if (process.env.NODE_ENV !== 'production') {
  winston.add(new winston.transports.Console({
    format: winston.format.cli(),
  }));
}

module.exports = winston;