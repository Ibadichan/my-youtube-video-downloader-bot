import 'dotenv/config';

import { Innertube, Utils, Platform, UniversalCache } from 'youtubei.js';
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

const WALLETS = {
  BTC:        '1KgxUoCK87hPrLVDXYwpQzZqS6Mus7D6N8',
  ETH:        '0xb0db7cb3c18a02c969416d4ec06bdd703d1756f8',
  TON:        'UQBuvR1J5N6XOlA2tuQ0xMT1OgAp6XG0BAEuap3zNHhrb6ba',
  USDT_TRC20: 'TQze9DixKds37maVgmnuVENnUDT7UynaRy',
};


const innertube = await Innertube.create({
  cookie: YOUTUBE_COOKIE,
  cache: new UniversalCache(false),
  generate_session_locally: true,
});

const pendingMap = new Map(); // Map<userId, { id: string, title: string }[]>
const langMap = new Map();
const downloadCountMap = new Map(); // Map<userId, number>

function buildDonateText(lang) {
  const t = translations[lang].donate;
  return [
    `<b>${t.label}</b>`,
    '',
    `₿ BTC (BTC):\n<code>${WALLETS.BTC}</code>`,
    `⟠ ETH (ERC20):\n<code>${WALLETS.ETH}</code>`,
    `ꘜ TON (TON):\n<code>${WALLETS.TON}</code>`,
    `₮ USDT (TRC20):\n<code>${WALLETS.USDT_TRC20}</code>`,
    '',
    `<i>${t.copied}</i>`,
    '',
    `<i>${t.other_payments}</i>`,
    `<a href="https://t.me/ibadichan">📬 @ibadichan</a>`,
  ].join('\n');
}

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
  const videoList = pendingMap.get(userId);
  const size = videoList.length;
  let errorSize = 0;

  while (videoList.length > 0) {
    const { id, title } = videoList.at(-1);
    let stream;

    try {
      const downloadingMsg = await ctx.reply(
        `${translations[lang].status.downloading} (${size - videoList.length + 1}/${size})`
      );

      const client = type === 'audio' ? 'WEB_EMBEDDED' : 'WEB';
      stream = await innertube.download(id, { type, quality, client });

      if (type === 'audio') {
        await ctx.replyWithAudio(new InputFile(Utils.streamToIterable(stream)), { title });
      } else {
        await ctx.replyWithVideo(new InputFile(Utils.streamToIterable(stream)), { title });
      }

      await ctx.api.deleteMessage(ctx.chat.id, downloadingMsg.message_id);
    } catch (error) {
      errorSize += 1;
      console.error(error);
      stream?.cancel();
      await ctx.reply(`${translations[lang].status.error} (${error.message})`);
    }

    videoList.pop();
  }

  await ctx.reply(`${translations[lang].status.success} (${size - errorSize}/${size})`);

  const prevCount = downloadCountMap.get(userId) ?? 0;
  const newCount = prevCount + (size - errorSize);
  downloadCountMap.set(userId, newCount);

  if (Math.floor(newCount / 5) > Math.floor(prevCount / 5)) {
    await ctx.reply(buildDonateText(lang), { parse_mode: 'HTML' });
  }
}

function buildQualityKeyboard(lang, qualityLabels) {
  const keyboard = new InlineKeyboard();
  keyboard.text(translations[lang].quality_select.options.best, 'dl:best');
  for (const label of qualityLabels) {
    keyboard.text(label, `dl:${label}`);
  }
  keyboard.row().text(translations[lang].quality_select.options.audio, 'dl:audio');
  return keyboard;
}

const selectLangMenu = new Menu('select-lang-menu')
  .text(translations.en.language_select.value, async (ctx) => {
    langMap.set(ctx.from.id, 'en');
    await ctx.reply(translations.en.getting_started);
  })
  .text(translations.ru.language_select.value, async (ctx) => {
    langMap.set(ctx.from.id, 'ru');
    await ctx.reply(translations.ru.getting_started);
  });

bot.use(selectLangMenu);

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (!data.startsWith('dl:')) return;

  await ctx.answerCallbackQuery();

  const value = data.slice(3);
  if (value === 'audio') {
    await processMedia(ctx, 'best', 'audio');
  } else {
    await processMedia(ctx, value);
  }
});

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;

  langMap.delete(userId);
  pendingMap.delete(userId);

  const greeting = [translations.en.greeting, translations.ru.greeting].join('\n');

  await ctx.reply(greeting);

  await selectLang(ctx);
});

bot.command('lang', async (ctx) => {
  await selectLang(ctx);
});

bot.command('donate', async (ctx) => {
  const lang = getLang(ctx.from.id);
  await ctx.reply(buildDonateText(lang), { parse_mode: 'HTML' });
});

bot.command('support', async (ctx) => {
  const lang = getLang(ctx.from.id);
  const t = translations[lang].support;

  const text = [
    `<b>${t.label}</b>`,
    '',
    `📧 ${t.email}: <code>badican01117@gmail.com</code>`,
    `📬 ${t.telegram}: <a href="https://t.me/ibadichan">t.me/ibadichan</a>`,
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'HTML' });
});

bot.on('message', async (ctx) => {
  const userId = ctx.from.id;
  const url = ctx.message.text?.trim();
  const lang = getLang(userId);

  if (!url) {
    await ctx.reply(translations[lang].errors.no_url);
    return;
  }

  try {
    await ctx.reply(translations[lang].status.searching);

    let videos = [];
    let qualityLabels = [];

    if (isYouTubePlaylist(url)) {
      const playlistId = new URL(url).searchParams.get('list');
      const playlist = await innertube.getPlaylist(playlistId);

      await ctx.reply(`${translations[lang].status.found} "${playlist.info.title}"`);

      for (const video of playlist.items) {
        if (video.type === 'PlaylistVideo') {
          videos.push({ id: video.id, title: video.title.toString() });
        }
      }

      if (videos.length > 0) {
        const info = await innertube.getBasicInfo(videos[0].id);
        const formats = info.streaming_data?.formats ?? [];
        qualityLabels = [...new Set(formats.map((f) => f.quality_label).filter(Boolean))];
      }
    } else {
      const videoId = extractVideoId(url);
      const info = await innertube.getBasicInfo(videoId);
      const title = info.basic_info.title ?? url;
      const formats = info.streaming_data?.formats ?? [];

      qualityLabels = [...new Set(formats.map((f) => f.quality_label).filter(Boolean))];
      videos.push({ id: videoId, title });

      await ctx.reply(`${translations[lang].status.found} "${title}"`);
    }

    if (videos.length === 0) return;

    pendingMap.set(userId, videos);

    await ctx.reply(translations[lang].quality_select.label, {
      reply_markup: buildQualityKeyboard(lang, qualityLabels),
    });
  } catch (error) {
    console.error(error);
    await ctx.reply(`${translations[lang].status.error} (${error.message})`);
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
    console.error('An error occurred while setting telegram webhook', err);
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
