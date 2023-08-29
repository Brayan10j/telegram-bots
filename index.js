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

bot.on("text", async (ctx) => {
  ctx.reply("Procesing ...");
  ctx.reply(await makeChatCompletion(ctx.update.message));
});

bot.on("voice", async (context) => {
  context.reply("Procesing ...");
  const fileLINK = await bot.telegram.getFileLink(
    context.message.voice.file_id
  );
  https.get(fileLINK.href, (response) => {
    if (response.statusCode !== 200) {
      console.error("Error en la solicitud:", response.statusCode);
      return;
    }

    // Crear un flujo de escritura hacia el archivo local
    const writeStream = fs.createWriteStream("salida.ogg");

    // Pipe (conectar) el flujo de lectura de la respuesta al flujo de escritura hacia el archivo local
    response.pipe(writeStream);

    writeStream.on("finish", async () => {
      const resp = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: fs.createReadStream("salida.ogg"),
      });
      const response = await makeChatCompletion({
        chat: {
          id: context.update.message.chat.id,
        },
        text: resp.text,
      });
      context.reply(response.text);
      /* await gTTS(response.text, {
        path: "Voice.mp3",
        lang: langdetect.detectOne(response.text),
      });
      context.sendAudio({ source: "Voice.mp3" }); */
      console.log("Archivo guardado correctamente en:", "salida.ogg");
    });

    writeStream.on("error", (err) => {
      console.error("Error al guardar el archivo:", err);
    });
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
