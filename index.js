require("dotenv").config();

const ytdl = require("ytdl-core");
const { Bot, InputFile, webhookCallback } = require("grammy");
const express = require("express");

const {
  TELEGRAM_TOKEN,
  TELEGRAM_WEBHOOK_URL,
} = process.env;

const bot = new Bot(TELEGRAM_TOKEN);

bot.command("start", async (ctx) => {
  const message = [
    "Hello! I'm a YouTube video downloader bot.",
    "To download a video from YouTube, send me the URL of the video.",
  ].join("\n");

  await ctx.reply(message, {
    parse_mode: "HTML",
  });
});

bot.on("message", async (ctx) => {
  const url = ctx.message.text.trim();

  if (url) {
    let videoStream;

    try {
      await ctx.reply("Getting video metadata…");

      const videoInfo = await ytdl.getInfo(url);

      await ctx.reply("Downloading video…");

      videoStream = ytdl.downloadFromInfo(videoInfo, {
        quality: "lowest",
        filter: "videoandaudio",
      });

      await ctx.replyWithVideo(new InputFile(videoStream));

      await ctx.reply("Successfully downloaded video!");
    } catch (error) {
      if (videoStream) videoStream.destroy();

      console.error(error);
      await ctx.reply(`Oops! Something went wrong. (${error.message})`);
    }
  } else {
    await ctx.reply("No url provided.");
  }
});

async function setupWebhook() {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${TELEGRAM_WEBHOOK_URL}`
    );
    if (!res.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    console.log("Telegram webhook", data);
  } catch (err) {
    console.error("An error occured while setting telegram webhook", err);
  }
}

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

  setupWebhook();
} else {
  // Use Long Polling for development
  bot.start();
}
