require("dotenv").config();

const ytdl = require("ytdl-core");
const { Bot, InlineKeyboard, InputFile, webhookCallback } = require("grammy");
const express = require("express");

const { TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_URL } = process.env;

const bot = new Bot(TELEGRAM_TOKEN);

const metadataMap = new Map();

bot.command("start", async (ctx) => {
  const message = [
    "Hello! I'm a YouTube video downloader bot.",
    "To download a video from YouTube, send me the URL of the video.",
  ].join("\n");

  await ctx.reply(message);
});

bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery();

  const filter = ctx.callbackQuery.data;

  if (filter === "download_all") {
    const inlineKeyboard = new InlineKeyboard()
      .text("Audio only", "audioonly")
      .text("Video only", "videoonly")
      .text("Video and Audio", "videoandaudio");

    await ctx.reply("Please choose media type to download:", {
      reply_markup: inlineKeyboard,
    });
  } else {
    const userId = ctx.from.id;
    let metadataList = metadataMap.get(userId);

    const size = metadataList.length;
    let errorSize = 0;

    async function downloadMedia() {
      if (metadataList.length === 0) return;

      let mediaStream;

      try {
        const metadata = metadataList[metadataList.length - 1];
        const title = metadata.videoDetails.title;

        await ctx.reply(
          `Downloading… (${size - metadataList.indexOf(metadata)}/${size})`
        );

        mediaStream = ytdl.downloadFromInfo(metadata, {
          quality: "lowest",
          filter,
        });

        if (filter === "audioonly") {
          await ctx.replyWithAudio(new InputFile(mediaStream), {
            title,
          });
        } else {
          await ctx.replyWithVideo(new InputFile(mediaStream), {
            title,
          });
        }
      } catch (error) {
        errorSize += 1;

        console.error(error);

        if (mediaStream) mediaStream.destroy();

        await ctx.reply(`Oops! Something went wrong. (${error.message})`);
      }

      metadataList.pop();

      await downloadMedia();
    }

    await downloadMedia();
    await ctx.reply(`Successfully downloaded! (${size - errorSize}/${size})`);
  }
});

bot.on("message", async (ctx) => {
  const userId = ctx.from.id;
  const url = ctx.message.text.trim();

  if (!metadataMap.has(userId)) {
    metadataMap.set(userId, []);
  }

  if (url) {
    try {
      await ctx.reply("Getting metadata…");

      const metadata = await ytdl.getInfo(url);
      const title = metadata.videoDetails.title;

      metadataMap.get(userId).push(metadata);

      await ctx.reply(`Found video: "${title}"`);
    } catch (error) {
      console.error(error);
      await ctx.reply(`Oops! Something went wrong. (${error.message})`);
    }
  } else {
    await ctx.reply("No url provided.");
  }

  const size = metadataMap.get(userId).length;

  if (size > 0) {
    const inlineKeyboard = new InlineKeyboard().text(
      `Download all (${size})`,
      "download_all"
    );

    await ctx.reply("Add another url or press 'Download all' button", {
      reply_markup: inlineKeyboard,
    });
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
