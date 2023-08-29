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


const bot = new Telegraf(process.env.BOT);
bot.start((ctx) => ctx.reply("Welcome"));
bot.help((ctx) => ctx.reply("Send me a sticker"));
bot.on("text", (ctx) => ctx.reply("👍"));
bot.hears("hi", (ctx) => ctx.reply("Hey there"));

bot.launch();
/* if (process.env.NODE_ENV == "production") {
  app.use(
    await bot.createWebhook({
      domain: "https://siontelegram-bots-352013a47d20.herokuapp.com",
    })
  );
} else {
  // if local use Long-polling
  bot.launch().then(() => {
    console.info(`The bot ${bot.botInfo.username} is running locally`);
  });
} */

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

app.listen(process.env.PORT || 3000, () => console.log("Listening server"));
