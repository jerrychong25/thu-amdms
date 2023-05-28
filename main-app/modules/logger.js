const winston = require('winston');
const config = require('./config-yaml');

let logger = winston.createLogger({
	format: winston.format.combine(
		winston.format.timestamp({
			format: () => {
				return new Date().toLocaleString('en-GB', {
					timeZone: 'Asia/Kuala_Lumpur'
				})
			}
		}),
		winston.format.printf(info => {
			return `${info.timestamp} ${info.level}: ${info.message}`;
		})
	),
	transports: [
		new winston.transports.Console(),
		new winston.transports.File({
			filename: 'log/' + config.APP_LOG
		})
	]
});

module.exports = logger;