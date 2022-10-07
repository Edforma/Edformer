const winston = require('winston');


winston.add(new winston.transports.File({ filename: `./logs/${new Date().toISOString()}.log` })) // Log to a file

if (process.env.NODE_ENV !== 'production') {
  winston.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({
          all:true
      }),
      winston.format.timestamp({
          format:"YY-MM-DD HH:mm:ss"
      }),
      winston.format.printf(
          info => `[${info.timestamp}] ${info.message}`
      )
    )
  }));
}

module.exports = winston;