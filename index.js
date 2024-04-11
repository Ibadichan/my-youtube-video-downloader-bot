require("dotenv").config();

const fs = require("fs");
const ytdl = require("ytdl-core");
const { Bot, InputFile, webhookCallback } = require("grammy");
const express = require("express");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

async function downloadVideo(url) {
  return new Promise((resolve, reject) => {
    const videoStream = ytdl(url);

    const fileStream = fs.createWriteStream("video.mp4");

    videoStream.pipe(fileStream);

    fileStream.on("error", (err) => reject(err));
    videoStream.on("error", (err) => reject(err));

    videoStream.on("end", () => resolve());
  });
}

bot.command("start", async (ctx) => {
  const message = [
    "Hello! I'm a youtube video downloader bot.",
    "<b>Commands</b>",
    "/download [url] - download video form youtube [url]",
  ].join("\n");

  await ctx.reply(message, {
    parse_mode: "HTML",
  });
});

bot.command("download", async (ctx) => {
  const url = ctx.message.text.split(" ")[1];

  if (url) {
    await ctx.reply(`Downloading: ${url}`);

    try {
      await downloadVideo(url);

      await ctx.replyWithVideo(new InputFile("video.mp4"));
    } catch (error) {
      await ctx.reply(`Oops! Something went wrong. (${error.message})`);
    }
  } else {
    await ctx.reply("No url provided.");
  }
});

const app = express();
app.use(express.json());
app.use(webhookCallback(bot, "express"));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Bot listening on port ${PORT}`);
});
