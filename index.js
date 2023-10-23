import express from "express";
import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import https from "https";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { ConversationSummaryMemory } from "langchain/memory";
import { message } from "telegraf/filters";
import translate from "translate-google";

//import { OpenAI } from "langchain/llms/openai";
import { LLMChain } from "langchain/chains";
import { PromptTemplate } from "langchain/prompts";
import { createClient } from "@supabase/supabase-js";

import cron from "node-cron";
import OpenAI from "openai";
import Parser from "rss-parser";

let task = cron.schedule(
  "0 9 * * *",
  async () => {
    try {
      const news = await getNews();
      for (let index = 0; index < 10; index++) {
        const element = news[index];
        const tituloTraducido =
          element.title !== ""
            ? await translate(element.title, { to: "it" })
            : " ";
        const contenidoTraducido =
          element.content !== ""
            ? await translate(element.content, { to: "it" })
            : " ";
        bot.telegram.sendMessage(
          "-1001989946156",
          "📢 " + tituloTraducido + " 📢 " + "\n" + "\n" + contenidoTraducido,
          {
            message_thread_id: "4",
            reply_markup: {
              inline_keyboard: [
                /* Inline buttons. 2 side-by-side */
                [Markup.button.url("Collegamento", element.link)],

                /* One button */
              ],
            },
          }
        );
      }
    } catch (error) {
      console.log(error);
      bot.telegram.sendMessage("-1001989946156", "Error : " + error);
    }
  },
  {
    scheduled: true,
    timezone: "Europe/Rome",
  }
);

task.start();

const openai = new OpenAI();

const prompt =
  PromptTemplate.fromTemplate(`The following is a friendly conversation between a human and an AI. AI prioritizes responding quickly.
Conversation history:
{history}
Human: 
{input}
AI:`);

const app = express();

const bot = new Telegraf(process.env.BOT);

const model = new ChatOpenAI(
  {
    modelName: "gpt-4",
    temperature: 0.2,
  } /* ,
  {
    basePath: "https://oai.hconeai.com/v1",
    baseOptions: {
      headers: {
        "Helicone-Auth": "Bearer " + process.env.HELICONE_API_KEY,
      },
    },
  } */
);

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    auth: {
      persistSession: false,
    },
  }
);

//https://www.coindesk.com/arc/outboundfeeds/rss
//https://cryptopotato.com/feed/
//https://crypto.news/feed/
//https://news.bitcoin.com/rss

//https://rss.app/feeds/mRsemwyw07GMBkZ7.xml
async function getNews() {
  const parser = new Parser();
  let feed = await parser.parseURL(
    "https://www.coindesk.com/arc/outboundfeeds/rss"
  );

  return feed.items;
}

async function access(ctx) {
  let res = await client
    .from("chats")
    .select("*")
    .eq("username", ctx.update.message.chat.username);
  return res.data.length > 0 && res.data[0].access;
}

async function makeChatCompletion(message) {
  try {
    let res = await client
      .from("chats")
      .select("*")
      .eq("username", message.chat.username);
    console.log(res);
    const memory = new ConversationSummaryMemory({
      llm: new ChatOpenAI({ temperature: 0.2 }),
    });
    if (res.data.length > 0) {
      await memory.saveContext(
        { input: res.data[0].history },
        { output: "conversation history" }
      );
    }

    const chain = new LLMChain({ llm: model, prompt, memory });
    const res1 = await chain.call({
      input: message.text,
    });

    const temp = await memory.loadMemoryVariables({});
    await client
      .from("chats")
      .upsert([
        {
          username: message.chat.username,
          chat_id: message.chat.id,
          history: temp.history,
          requests: res.data[0].requests + 1,
        },
      ])
      .select();
    return res1;
  } catch (error) {
    console.log(error);
    return error;
  }
}

// id group chat  -1001989946156
//bot.sendMessage("-1001989946156",text,{reply_to_message_id: ctx.message_id})

/* bot.use(async (ctx, next) => {
  let res = await client
    .from("chats")
    .select("*")
    .eq("id", ctx.update.message.chat.id);
  if (res.data.length > 0 && res.data[0].access) {
    await next();
  } else {
    ctx.reply(" you haven't access");
  }
}); */

bot.start(async (ctx) => {
  ctx.reply("Welcome !!");
  //ctx.reply(tituloTraducido)
});

//bot.telegram.sendMessage("-1001989946156","test to topic",{message_thread_id: "4"})

bot.command("news", async (ctx) => {
  try {
    const news = await getNews();
    for (let index = 0; index < 10; index++) {
      const element = news[index];
      const tituloTraducido =
        element.title !== ""
          ? await translate(element.title, { to: "it" })
          : " ";
      const contenidoTraducido =
        element.content !== ""
          ? await translate(element.content, { to: "it" })
          : " ";

      ctx.reply(
        "📢 " + tituloTraducido + " 📢 " + "\n" + "\n" + contenidoTraducido,
        {
          reply_markup: {
            inline_keyboard: [
              [Markup.button.url("Collegamento", element.link)],
            ],
          },
        }
      );
    }
  } catch (error) {
    console.log(error);
    ctx.reply("-1001989946156", "Error : " + error);
  }
});

bot.on(message("text"), async (ctx) => {
  let x = await access(ctx);
  if (x) {
    ctx.persistentChatAction("typing", async () => {
      const chatCompletionResponse = await makeChatCompletion(
        ctx.update.message
      );
      ctx.reply(chatCompletionResponse);
    });
  } else {
    ctx.reply("you haven't access ");
  }
});

bot.on("voice", async (context) => {
  let x = await access(context);
  if (x) {
    const chatId = context.update.message.chat.id;

    context.persistentChatAction("typing", async () => {
      const fileLink = await bot.telegram.getFileLink(
        context.message.voice.file_id
      );

      await new Promise((resolve, reject) => {
        https.get(fileLink.href, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Error en la solicitud: ${response.statusCode}`));
            return;
          }

          const writeStream = fs.createWriteStream("salida.ogg");
          response.pipe(writeStream);

          writeStream.on("finish", resolve);
          writeStream.on("error", (err) => {
            reject(err);
          });
        });
      });

      const resp = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: fs.createReadStream("salida.ogg"),
      });

      const completionResponse = await makeChatCompletion({
        chat: {
          id: chatId,
          username: context.update.message.chat.username,
        },
        text: resp.text,
      });

      context.reply(completionResponse.text);
    });
  } else {
    context.reply("you haven't access ");
  }
});

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
process.once("SIGINT", () => {
  bot.stop("SIGINT");
  task.stop();
});
process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  task.stop();
});

app.listen(process.env.PORT || 3000, () => console.log("Listening server"));
