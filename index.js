require("dotenv").config();

const ytpl = require("@distube/ytpl");
const ytdl = require("@distube/ytdl-core");
const { Bot, InputFile, webhookCallback } = require("grammy");
const { Menu } = require("@grammyjs/menu");
const express = require("express");
const translations = require("./translations");
const { isYouTubePlaylist } = require("./utils");
const cookies = require('./cookies');

const agent = ytdl.createAgent(cookies);

const metadataMap = new Map();
const langMap = new Map();

const { TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_URL } = process.env;

const bot = new Bot(TELEGRAM_TOKEN);

function getLang(userId) {
  return langMap.get(userId) || "en";
}

async function selectLang(ctx) {
  const languageSelect = [
    translations.en.language_select.label,
    translations.ru.language_select.label,
  ].join(" | ");

  await ctx.reply(languageSelect, {
    reply_markup: selectLangMenu,
  });
}

async function processMedia(ctx, filter) {
  const userId = ctx.from.id;

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

      const downloadingMsg = await ctx.reply(
        `${translations[lang].status.downloading} (${
          size - metadataList.indexOf(metadata)
        }/${size})`
      );

      mediaStream = ytdl.downloadFromInfo(metadata, {
        quality: "lowest",
        filter,
        agent,
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

      await ctx.api.deleteMessage(ctx.chat.id, downloadingMsg.message_id);
    } catch (error) {
      errorSize += 1;

      console.error(error);

      if (mediaStream) mediaStream.destroy();

      await ctx.reply(`${translations[lang].status.error} (${error.message})`);
    }

    metadataList.pop();

    await downloadMedia();
  }

  await downloadMedia();

  await ctx.reply(
    `${translations[lang].status.success} (${size - errorSize}/${size})`
  );
}

const selectLangMenu = new Menu("select-lang-menu")
  .text(translations.en.language_select.value, async (ctx) => {
    const userId = ctx.from.id;
    langMap.set(userId, "en");
    await ctx.reply(translations.en.getting_started);
  })
  .text(translations.ru.language_select.value, async (ctx) => {
    const userId = ctx.from.id;
    langMap.set(userId, "ru");
    await ctx.reply(translations.ru.getting_started);
  });

const selectMediaMenu = new Menu("select-media-menu")
  .text(
    async (ctx) => {
      const userId = ctx.from.id;
      const lang = getLang(userId);

      return translations[lang].media_select.options.all;
    },
    async (ctx) => processMedia(ctx, "videoandaudio")
  )
  .text(
    async (ctx) => {
      const userId = ctx.from.id;
      const lang = getLang(userId);

      return translations[lang].media_select.options.video;
    },
    async (ctx) => processMedia(ctx, "videoonly")
  )
  .text(
    async (ctx) => {
      const userId = ctx.from.id;
      const lang = getLang(userId);

      return translations[lang].media_select.options.audio;
    },
    async (ctx) => processMedia(ctx, "audioonly")
  );

const downloadAllMenu = new Menu("download-all-menu").text(
  async (ctx) => {
    const userId = ctx.from.id;
    const lang = getLang(userId);
    const size = metadataMap.get(userId).length;

    return `${translations[lang].manager.action} (${size})`;
  },
  async (ctx) => {
    const userId = ctx.from.id;
    const lang = getLang(userId);

    await ctx.reply(translations[lang].media_select.label, {
      reply_markup: selectMediaMenu,
    });
  }
);

bot.use(selectLangMenu);
bot.use(selectMediaMenu);
bot.use(downloadAllMenu);

bot.command("start", async (ctx) => {
  const userId = ctx.from.id;

  langMap.delete(userId);
  metadataMap.delete(userId);

  const greeting = [translations.en.greeting, translations.ru.greeting].join(
    "\n"
  );

  await ctx.reply(greeting);

  await selectLang(ctx);
});

bot.command("lang", async (ctx) => {
  await selectLang(ctx);
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

      const addVideoToQueue = async (url) => {
        const metadata = await ytdl.getInfo(url, { 
          agent,
          playerClients: ["WEB"],
        });

        metadataMap.get(userId).push(metadata);

        return metadata;
      };

      if (isYouTubePlaylist(url)) {
        const playlist = await ytpl(url);

        await ctx.reply(
          `${translations[lang].status.found} "${playlist.title}"`
        );
        await ctx.reply(`${translations[lang].status.downloading}`);

        const mediaPull = playlist.items.map((item) =>
          addVideoToQueue(item.shortUrl)
        );

        await Promise.all(mediaPull);
      } else {
        const metadata = await addVideoToQueue(url);

        const title = metadata.videoDetails.title;
        await ctx.reply(`${translations[lang].status.found} "${title}"`);
      }
    } catch (error) {
      console.error(error);
      await ctx.reply(`${translations[lang].status.error} (${error.message})`);
    }
  } else {
    await ctx.reply(translations[lang].status.errors.no_url);
  }

  const size = metadataMap.get(userId).length;

  if (size > 0) {
    await ctx.reply(translations[lang].manager.text, {
      reply_markup: downloadAllMenu,
    });
  }
});

async function setupWebhook() {
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteWebhook?drop_pending_updates=true`
    );

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
