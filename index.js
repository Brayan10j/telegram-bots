import express from "express";
import "dotenv/config";
import { Telegraf, session } from "telegraf";
import fs from "fs";
import https from "https";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { ConversationSummaryMemory } from "langchain/memory";
import { message } from "telegraf/filters";

//import { OpenAI } from "langchain/llms/openai";
import { LLMChain } from "langchain/chains";
import { PromptTemplate } from "langchain/prompts";
import { createClient } from "@supabase/supabase-js";

import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { SerpAPI } from "langchain/tools";

import cron from "node-cron";
import OpenAI from "openai";

let task = cron.schedule(
  "0 9 * * *",
  async () => {
    bot.telegram.sendMessage("-1001989946156", await getNews(), {
      message_thread_id: "4",
    });
  },
  {
    scheduled: true,
    timezone: "Europe/Rome",
  }
);

task.start();

const openai = new OpenAI();

const prompt = PromptTemplate.fromTemplate(`
Conversation history:
{history}
Human: 
{input}
AI:`);

const app = express();

const bot = new Telegraf(process.env.BOT);

const model = new ChatOpenAI(
  {} /* ,
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
async function getNews() {
  const executor = await initializeAgentExecutorWithOptions(
    [new SerpAPI()],
    new ChatOpenAI({ modelName: "gpt-4-0613" }),
    {
      agentType: "openai-functions",
    }
  );

  return await executor.run(
    "Dame las últimas noticias de hoy más relevantes del mundo crypto, respóndeme solo con una lista con títulos y descripción resumida y un link de referencia que me lleve a leer cada una"
  );
}

async function access() {
  let res = await client
    .from("chats")
    .select("*")
    .eq("username", ctx.update.message.chat.username);
  return res.data.length > 0 && res.data[0].access;
}

async function makeChatCompletion(message) {
  let res = await client.from("chats").select("*").eq("id", message.chat.id);

  const memory = new ConversationSummaryMemory({
    llm: new ChatOpenAI({ temperature: 0 }),
  });

  if (res.data.length > 0) {
    const history = res.data[0].history;
    await memory.saveContext(
      { input: history },
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
        id: message.chat.id,
        history: temp.history,
        requests: res.data[0].requests + 1,
      },
    ])
    .select();
  return res1;
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

bot.start((ctx) => {
  ctx.reply("Welcome");
});

//bot.telegram.sendMessage("-1001989946156","test to topic",{message_thread_id: "4"})

bot.command("news", async (ctx) => {
  ctx.reply(await getNews());
});

bot.on(message("text"), (ctx) => {
  ctx.persistentChatAction("typing", async () => {
    const chatCompletionResponse = await makeChatCompletion(ctx.update.message);
    ctx.reply(chatCompletionResponse);
  });
});

bot.on("voice", async (context) => {
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
      },
      text: resp.text,
    });

    context.reply(completionResponse.text);
    console.log("Archivo guardado correctamente en: salida.ogg");
  });
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
