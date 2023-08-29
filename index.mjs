import { Telegraf } from "telegraf";
import 'dotenv/config';

const bot = new Telegraf(process.env.BOT);
bot.start((ctx) => ctx.reply('Welcome'));
bot.help((ctx) => ctx.reply('Send me a sticker'));
bot.on("text", (ctx) => ctx.reply('👍'));
bot.hears('hi', (ctx) => ctx.reply('Hey there'));
bot.launch().then(() => {
    console.log('Bot iniciado');
}).catch((err) => {
    console.error('Error al iniciar el bot', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 