const { Telegraf } = require('telegraf')
const logger = require("../modules/logger")
const bot = new Telegraf("**********")
const chatId = "**********"

module.exports = async (event, context) => {
  const data = JSON.parse(event.body)

  const messagesData = data.messages

  try {
    logger.log('info', "Sending Telegram Messages.....")

    logger.log('info', "messagesData: ")
    logger.log('info', messagesData)

    await bot.telegram.sendMessage(chatId, messagesData);

    logger.log('info', "Telegram Messages Sent!")

    return { 
      statusCode: 200, 
      body: "POST Success!"
    }
  } catch (error) {
    logger.log('error', "error: ")
    logger.log('info', error)

    return { 
      statusCode: 500, 
      body: error
    }
  }
}