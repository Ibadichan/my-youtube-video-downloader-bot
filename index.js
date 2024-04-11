require("dotenv").config();

const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const ytdl = require("ytdl-core");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

bot.onText(/\/download (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const videoUrl = match[1];

  try {
    bot.sendMessage(chatId, "Downloading...");

    const video = ytdl(videoUrl);

    video.pipe(fs.createWriteStream("dist/video.mp4"));

    video.on("end", () => {
      bot.sendVideo(chatId, "dist/video.mp4");
    });
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "Oops! Something went wrong.");
  }
});
