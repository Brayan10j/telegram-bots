import express, { json } from "express";
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

import { Client, auth } from "twitter-api-sdk";

import cron from "node-cron";
import OpenAI from "openai";
import Parser from "rss-parser";

/* const authClient = new auth.OAuth2User({
  client_id: process.env.CLIENT_ID ,
  client_secret: process.env.CLIENT_SECRET,
  callback: "http://127.0.0.1:3000/callback",
  scopes: ["tweet.read", "users.read", "offline.access"],
}); */
const twitterClient = new Client(
  "AAAAAAAAAAAAAAAAAAAAAHj%2BrAEAAAAA7sOutU7J3Fg3nb%2F%2FXqaYU38EKE4%3Du0ULQuZPSYIzNyeztYdAOV15Qtv24NbwibZx4oMJR5doCzhJe0"
);

/* (async () => {
  try {
    const usernameLookup = await twitterClient.users.findUserByUsername(
      //The Twitter username (handle) of the user.
      "TwitterDev"
    );
    console.dir(usernameLookup, {
      depth: null,
    });
  } catch (error) {
    console.log(error);
  }
})(); */

/* /* const { data } = await twitterClient.users.findUserByUsername("TwitterDev");
if (!data) throw new Error("Couldn't find user");
; */
//const tweet = await clientX.tweets.findTweetById("20");
let task = cron.schedule(
  "0 9 * * *",
  async () => {
    try {
      const news = await getNews();
      const tweets  = await getTweets()
      bot.telegram.sendMessage(
        "-1001989946156",
        "##########NEWS##########"
      );
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
      bot.telegram.sendMessage(
        "-1001989946156",
        "##########TWEETS##########"
      );
      for (let index = 0; index < 10; index++) {
        bot.telegram.sendMessage(
          "-1001989946156",
          tweets[index].text
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

const sitiosWeb = [
  "https://www.coindesk.com/arc/outboundfeeds/rss",
  "https://cryptobriefing.com/feed/",
];
async function getNews() {
  const parser = new Parser();
  const noticias = [];
  for (const sitio of sitiosWeb) {
    try {
      const feed = await parser.parseURL(sitio);
      noticias.push(...feed.items);
    } catch (error) {
      console.error(`Error al obtener noticias de ${sitio}: ${error}`);
    }
  }
  return noticias.sort(() => Math.random() - 0.5);
}

const idsTweets = [
  "813674916784418817",
  "1070099092246802432",
];

async function getTweets() {
  const tweets = [];
  for (const id of idsTweets) {
    try {
      const tweet = await twitterClient.tweets.usersIdTweets(id);
      tweets.push(...tweet.data);
    } catch (error) {
      console.error(`Error al obtener tweets: ${error}`);
    }
  }
  return tweets.sort(() => Math.random() - 0.5);
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

bot.start(async (ctx) => {
  ctx.reply("Welcome !!");
  //ctx.reply(tituloTraducido)
});


/* 
https://twitter.com/AstrologyCrypto 813674916784418817
https://twitter.com/SamuelXeus 1070099092246802432
https://twitter.com/crypthoem/
https://twitter.com/XMaximist
https://twitter.com/crypto_condom
https://twitter.com/deg_ape */

bot.command("tweets", async (ctx) => {
  try {
    //let resutl = ctx.update.message.text.split(" ");
    const tweets  = await getTweets()
    for (let index = 0; index < 10; index++) {
      ctx.reply(tweets[index].text)
    }
    //ctx.reply(tweets)
    /* ctx.reply(tweets.data.text);
    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "You are an assistant analyzing tweets related to cryptocurrencies and your response should only be Buy or NULL, do not add anything else." },
        {
          role: "user",
          content: `I need you to analyze the following tweet that a trader made so that you can help me interpret it, if he is talking about a crypto, I need to know if it is positive and understands that the market for that token will increase its price or negative according to your opinion, answer me alone with BUY if it is positive or NULL if it is negative, Your response should only be Buy or NULL, do not add anything else: ${tweets.data.text}`,
        },
      ],
      model: "gpt-4",
    });
    ctx.reply(completion.choices[0].message.content); */
  } catch (error) {
    console.log(error);
  }
});

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
