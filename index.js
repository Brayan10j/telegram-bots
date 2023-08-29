import express from "express";
import "dotenv/config";
import { Telegraf } from "telegraf";

/* const prompt = PromptTemplate.fromTemplate(`
Conversation history:
{history}
Human: 
{input}
AI:`); */


const app = express();


app.get('/', (req, res) => {
    res.send('GET request to the homepage')
  })

app.post('/', (req, res) => {
    console.log(req.body)
    res.send('POST request to the homepage')
})

const bot = new Telegraf(process.env.BOT);
bot.start((ctx) => ctx.reply("Welcome"));
bot.help((ctx) => ctx.reply("Send me a sticker"));
bot.on("text", (ctx) => ctx.reply("👍"));
bot.hears("hi", (ctx) => ctx.reply("Hey there"));
if (process.env.NODE_ENV == "production") {
  bot
    .launch({
      webhook: {
        domain: "https://siontelegram-bots-352013a47d20.herokuapp.com/",
        port: process.env.PORT,
      },
    })
    .then(() => {
      console.info(`The bot ${bot.botInfo.username} is running on server`);
    });
} else {
  // if local use Long-polling
  bot.launch().then(() => {
    console.info(`The bot ${bot.botInfo.username} is running locally`);
  });
}

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));





app.listen(process.env.PORT || 3000 , () => console.log("Listening server"));
