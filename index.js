import express from "express";
import "dotenv/config";
import { Telegraf } from "telegraf";
import fs from "fs";
import https from "https";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { ConversationSummaryMemory } from "langchain/memory";
import { LLMChain } from "langchain/chains";
import { PromptTemplate } from "langchain/prompts";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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
      },
    ])
    .select();
  return res1;
}
bot.start((ctx) => ctx.reply("Welcome"));

bot.on("text", (ctx) => {
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
          clearInterval(typingInterval);
          reject(new Error(`Error en la solicitud: ${response.statusCode}`));
          return;
        }

        const writeStream = fs.createWriteStream("salida.ogg");
        response.pipe(writeStream);

        writeStream.on("finish", resolve);
        writeStream.on("error", (err) => {
          clearInterval(typingInterval);
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
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

app.listen(process.env.PORT || 3000, () => console.log("Listening server"));
