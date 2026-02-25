import 'dotenv/config';

import { Innertube, Utils, Platform } from 'youtubei.js';
import { Bot, InputFile, InlineKeyboard, webhookCallback } from 'grammy';
import { Menu } from '@grammyjs/menu';
import express from 'express';
import translations from './translations.js';
import { isYouTubePlaylist, extractVideoId } from './utils.js';

Platform.shim.eval = (data, env) => {
  const properties = [];

  if (env.n) {
    properties.push(`n: exportedVars.nFunction("${env.n}")`);
  }

  if (env.sig) {
    properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  }

  const code = `${data.output}\nreturn { ${properties.join(', ')} }`;

  return new Function(code)();
};

const { TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_URL, YOUTUBE_COOKIE } = process.env;

const innertube = await Innertube.create({
  cookie: YOUTUBE_COOKIE,
});

const metadataMap = new Map(); // Map<userId, { id: string, title: string }[]>
const langMap = new Map();

const bot = new Bot(TELEGRAM_TOKEN);

function getLang(userId) {
  return langMap.get(userId) || 'en';
}

async function selectLang(ctx) {
  const languageSelect = [
    translations.en.language_select.label,
    translations.ru.language_select.label,
  ].join(' | ');

  await ctx.reply(languageSelect, {
    reply_markup: selectLangMenu,
  });
}

async function processMedia(ctx, quality, type = 'video+audio') {
  const userId = ctx.from.id;
  const lang = getLang(userId);

  let videoList = metadataMap.get(userId);

  const size = videoList.length;
  let errorSize = 0;

  async function downloadMedia() {
    if (videoList.length === 0) return;

    let stream;

    try {
      const video = videoList[videoList.length - 1];
      const { id, title } = video;

      const downloadingMsg = await ctx.reply(
        `${translations[lang].status.downloading} (${size - videoList.length + 1}/${size})`
      );

      stream = await innertube.download(id, { type, quality, client: 'ANDROID' });

      if (type === 'audio') {
        await ctx.replyWithAudio(new InputFile(Utils.streamToIterable(stream)), { title });
      } else {
        await ctx.replyWithVideo(new InputFile(Utils.streamToIterable(stream)), { title });
      }

      await ctx.api.deleteMessage(ctx.chat.id, downloadingMsg.message_id);
    } catch (error) {
      errorSize += 1;

      console.error(error);

      if (stream) stream.cancel();

      await ctx.reply(`${translations[lang].status.error} (${error.message})`);
    }

    videoList.pop();

    await downloadMedia();
  }

  await downloadMedia();

  await ctx.reply(
    `${translations[lang].status.success} (${size - errorSize}/${size})`
  );
}

const selectLangMenu = new Menu('select-lang-menu')
  .text(translations.en.language_select.value, async (ctx) => {
    const userId = ctx.from.id;
    langMap.set(userId, 'en');
    await ctx.reply(translations.en.getting_started);
  })
  .text(translations.ru.language_select.value, async (ctx) => {
    const userId = ctx.from.id;
    langMap.set(userId, 'ru');
    await ctx.reply(translations.ru.getting_started);
  });

const downloadAllMenu = new Menu('download-all-menu').text(
  async (ctx) => {
    const userId = ctx.from.id;
    const lang = getLang(userId);
    const size = metadataMap.get(userId).length;

    return `${translations[lang].manager.action} (${size})`;
  },
  async (ctx) => {
    const userId = ctx.from.id;
    const lang = getLang(userId);
    const videoList = metadataMap.get(userId);
    const firstVideo = videoList[videoList.length - 1];

    let qualityLabels = [];
    try {
      const info = await innertube.getBasicInfo(firstVideo.id);
      const formats = info.streaming_data?.formats ?? [];
      qualityLabels = [...new Set(formats.map((f) => f.quality_label).filter(Boolean))];
    } catch (e) {
      console.error(e);
    }

    const keyboard = new InlineKeyboard();
    keyboard.text(translations[lang].quality_select.options.best, 'dl:best');
    for (const label of qualityLabels) {
      keyboard.text(label, `dl:${label}`);
    }

    await ctx.reply(translations[lang].quality_select.label, {
      reply_markup: keyboard,
    });
  }
);

bot.use(selectLangMenu);
bot.use(downloadAllMenu);

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith('dl:')) return;

  await ctx.answerCallbackQuery();

  await processMedia(ctx, data.slice(3));
});

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;

  langMap.delete(userId);
  metadataMap.delete(userId);

  const greeting = [translations.en.greeting, translations.ru.greeting].join('\n');

  await ctx.reply(greeting);

  await selectLang(ctx);
});

bot.command('lang', async (ctx) => {
  await selectLang(ctx);
});

bot.on('message', async (ctx) => {
  const userId = ctx.from.id;
  const url = ctx.message.text.trim();
  const lang = getLang(userId);

  if (!metadataMap.has(userId)) {
    metadataMap.set(userId, []);
  }

  if (url) {
    try {
      await ctx.reply(translations[lang].status.searching);

      if (isYouTubePlaylist(url)) {
        const playlistId = new URL(url).searchParams.get('list');
        const playlist = await innertube.getPlaylist(playlistId);

        await ctx.reply(`${translations[lang].status.found} "${playlist.info.title}"`);

        for (const video of playlist.items) {
          if (video.type === 'PlaylistVideo') {
            metadataMap.get(userId).push({ id: video.id, title: video.title.toString() });
          }
        }
      } else {
        const videoId = extractVideoId(url);
        const info = await innertube.getBasicInfo(videoId);
        const title = info.basic_info.title ?? url;

        metadataMap.get(userId).push({ id: videoId, title });

        await ctx.reply(`${translations[lang].status.found} "${title}"`);
      }
    } catch (error) {
      console.error(error);
      await ctx.reply(`${translations[lang].status.error} (${error.message})`);
    }
  } else {
    await ctx.reply(translations[lang].errors.no_url);
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
      throw new Error('Network response was not ok');
    }
    const data = await res.json();
    console.log('Telegram webhook', data);
  } catch (err) {
    console.error('An error occured while setting telegram webhook', err);
  }
}

// Start the server
if (process.env.NODE_ENV === 'production') {
  // Use Webhooks for the production server
  const app = express();
  app.use(express.json());
  app.use(webhookCallback(bot, 'express'));

  const PORT = process.env.PORT || 3000;

  app.get('/health', (req, res) => {
    res.send('Bot is running');
  });

  app.listen(PORT, () => {
    console.log(`Bot listening on port ${PORT}`);
  });

  setupWebhook();
} else {
  // Use Long Polling for development
  bot.start();
}
