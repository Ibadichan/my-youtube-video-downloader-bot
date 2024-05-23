require("dotenv").config();

const ytdl = require("ytdl-core");
const { Bot, InlineKeyboard, InputFile, webhookCallback } = require("grammy");
const express = require("express");
const translations = require("./translations");

const { TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_URL } = process.env;

const bot = new Bot(TELEGRAM_TOKEN);

const metadataMap = new Map();
const langMap = new Map();

function getLang(userId) {
  return langMap.get(userId) || "en";
}

async function selectLang(ctx) {
  const inlineKeyboard = new InlineKeyboard()
    .text(translations.en.language_select.value, "en")
    .text(translations.ru.language_select.value, "ru");

  const languageSelect = [
    translations.en.language_select.label,
    translations.ru.language_select.label,
  ].join(" | ");

  await ctx.reply(languageSelect, {
    reply_markup: inlineKeyboard,
  });
}

bot.command("start", async (ctx) => {
  const greeting = [translations.en.greeting, translations.ru.greeting].join(
    "\n"
  );

  await ctx.reply(greeting);

  await selectLang(ctx);
});

bot.command("lang", async (ctx) => {
  await selectLang(ctx);
});

bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery();

  const userId = ctx.from.id;
  const filter = ctx.callbackQuery.data;

  if (filter === "en") {
    langMap.set(userId, "en");
    await ctx.reply(translations.en.getting_started);
  } else if (filter === "ru") {
    langMap.set(userId, "ru");
    await ctx.reply(translations.ru.getting_started);
  } else if (filter === "download_all") {
    const lang = getLang(userId);

    const inlineKeyboard = new InlineKeyboard()
      .text(translations[lang].media_select.options.all, "videoandaudio")
      .text(translations[lang].media_select.options.video, "videoonly")
      .text(translations[lang].media_select.options.audio, "audioonly");

    await ctx.reply(translations[lang].media_select.label, {
      reply_markup: inlineKeyboard,
    });
  } else {
    const lang = getLang(userId);

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
          `${translations[lang].status.downloading} (${
            size - metadataList.indexOf(metadata)
          }/${size})`
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

        await ctx.reply(
          `${translations[lang].status.error} (${error.message})`
        );
      }

      metadataList.pop();

      await downloadMedia();
    }

    await downloadMedia();

    await ctx.reply(
      `${translations[lang].status.success} (${size - errorSize}/${size})`
    );
  }
});

bot.on("message", async (ctx) => {
  const userId = ctx.from.id;
  const url = ctx.message.text.trim();
  const lang = getLang(userId);

  if (!metadataMap.has(userId)) {
    metadataMap.set(userId, []);
  }

  if (url) {
    try {
      await ctx.reply(translations[lang].status.searching);

      const metadata = await ytdl.getInfo(url);
      const title = metadata.videoDetails.title;

      metadataMap.get(userId).push(metadata);

      await ctx.reply(`${translations[lang].status.found} "${title}"`);
    } catch (error) {
      console.error(error);
      await ctx.reply(`${translations[lang].status.error} (${error.message})`);
    }
  } else {
    await ctx.reply(translations[lang].status.errors.no_url);
  }

  const size = metadataMap.get(userId).length;

  if (size > 0) {
    const inlineKeyboard = new InlineKeyboard().text(
      `${translations[lang].manager.action} (${size})`,
      "download_all"
    );

    await ctx.reply(translations[lang].manager.text, {
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
    const data = await res.json();
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
