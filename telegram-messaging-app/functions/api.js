const api = require('./v1')
const logger = require("./modules/logger")

exports.handler = async (event, context) => {
  switch (event.httpMethod) {
    // GET /.netlify/functions/api
    case 'GET':
      logger.log('info', "Echo.....")

      return { 
        statusCode: 200, 
        body: "GET Success!" 
      }

    // POST /.netlify/functions/api
    case 'POST':
      return api.send(event, context)
    
    // Other Flows
    default:
      return {
        statusCode: 500,
        body: 'Unknown HTTP Method!'
      }
  }
}