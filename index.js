require("dotenv").config();

const ytdl = require("ytdl-core");
const { Bot, InputFile, webhookCallback } = require("grammy");
const express = require("express");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

bot.command("start", async (ctx) => {
  const message = [
    "Hello! I'm a YouTube video downloader bot.",
    "To download a video from YouTube, send me the URL of the video."
  ].join("\n");

  await ctx.reply(message, {
    parse_mode: "HTML",
  });
});

bot.on("message", async (ctx) => {
  const url = ctx.message.text.trim();

  if (url) {
    try {
      await ctx.reply(`Downloading: ${url}`);

      const videoInfo = await ytdl.getInfo(url);
      const videoStream = ytdl.downloadFromInfo(videoInfo, { quality: 'lowest' });

      await ctx.replyWithVideo(new InputFile(videoStream), {
        caption: "Successfully downloaded video!",
      });
    } catch (error) {
      console.error(error);
      await ctx.reply(`Oops! Something went wrong. (${error.message})`);
    }
  } else {
    await ctx.reply("No url provided.");
  }
});

// Start the server
if (process.env.NODE_ENV === "production") {
  // Use Webhooks for the production server
  const app = express();
  app.use(express.json());
  app.use(webhookCallback(bot, "express"));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Bot listening on port ${PORT}`);
  });
} else {
  // Use Long Polling for development
  bot.start();
}
