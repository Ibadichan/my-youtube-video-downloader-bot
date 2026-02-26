import 'dotenv/config';

import { Innertube, Platform, UniversalCache, Utils } from 'youtubei.js';
import { Bot, InputFile, InlineKeyboard, webhookCallback } from 'grammy';
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

const pendingMap = new Map(); // Map<userId, { videos: { id, title }[], thumbnailUrl: string|null }>
const downloadCountMap = new Map(); // Map<userId, number>

function getLang(ctx) {
  return ctx.from?.language_code === 'ru' ? 'ru' : 'en';
}

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

bot.catch((err) => console.error('Unhandled bot error:', err));

async function processMedia(ctx, quality, type = 'video+audio', sourceMsg = null) {
  const userId = ctx.from.id;
  const lang = getLang(ctx);
  const { videos: videoList, thumbnailUrl } = pendingMap.get(userId);
  const size = videoList.length;
  let errorSize = 0;
  let infoMsg = null;

  if (sourceMsg) {
    try {
      await ctx.api.deleteMessage(sourceMsg.chat.id, sourceMsg.message_id);
    } catch (e) {
      console.error('Failed to delete source message:', e);
    }

    const loadingCaption = `⏳ ${translations[lang].status.downloading}`;
    try {
      if (thumbnailUrl) {
        infoMsg = await ctx.replyWithPhoto(thumbnailUrl, { caption: loadingCaption });
      } else {
        infoMsg = await ctx.reply(loadingCaption);
      }
    } catch (e) {
      console.error('Failed to send loading message:', e);
    }
  }

  let lastDownloaded = null;

  while (videoList.length > 0) {
    const { id, title } = videoList.at(-1);
    let stream;

    try {
      const client = type === 'audio' ? 'WEB_EMBEDDED' : 'WEB';
      stream = await innertube.download(id, { type, quality, client });

      if (type === 'audio') {
        await ctx.replyWithAudio(new InputFile(Utils.streamToIterable(stream), 'audio.mp3'), { title });
      } else {
        await ctx.replyWithVideo(new InputFile(Utils.streamToIterable(stream), 'video.mp4'), { title });
      }

      lastDownloaded = { id, title };
    } catch (error) {
      errorSize += 1;
      console.error(error);
      stream?.cancel();
      await ctx.reply(`${translations[lang].status.error} (${error.message})`);
    }

    videoList.pop();
  }

  if (infoMsg && lastDownloaded) {
    try {
      await ctx.api.deleteMessage(infoMsg.chat.id, infoMsg.message_id);
    } catch (e) {
      console.error('Failed to delete loading message:', e);
    }

    const { id, title } = lastDownloaded;
    const mediaEmoji = type === 'audio' ? '🎵' : '🎬';
    const qualityLabel = type === 'audio'
      ? translations[lang].quality_select.options.audio
      : quality;
    const doneCaption = [
      `${mediaEmoji} <b>${title}</b>`,
      `🔗 https://youtu.be/${id}`,
      `📥 ${qualityLabel}`,
    ].join('\n');

    try {
      if (thumbnailUrl) {
        await ctx.replyWithPhoto(thumbnailUrl, { caption: doneCaption, parse_mode: 'HTML' });
      } else {
        await ctx.reply(doneCaption, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      }
    } catch (e) {
      console.error('Failed to send done message:', e);
    }
  }

  const prevCount = downloadCountMap.get(userId) ?? 0;
  const newCount = prevCount + (size - errorSize);
  downloadCountMap.set(userId, newCount);

  if (Math.floor(newCount / 5) > Math.floor(prevCount / 5)) {
    await ctx.reply(buildDonateText(lang), { parse_mode: 'HTML' });
  }
}

function getBestThumbnailUrl(thumbnails) {
  const jpegs = (thumbnails ?? []).filter((t) => !t.url?.includes('.webp'));
  if (!jpegs.length) return null;
  return jpegs.reduce((best, t) => ((t.width ?? 0) > (best.width ?? 0) ? t : best)).url;
}

function getQualityLabels(streamingData) {
  const labels = [...new Set(
    (streamingData?.formats ?? []).map((f) => f.quality_label).filter(Boolean)
  )];
  return labels.sort((a, b) => parseInt(a) - parseInt(b));
}

function hasAudioTrack(streamingData) {
  return (streamingData?.adaptive_formats ?? []).some(
    (f) => f.mime_type?.startsWith('audio/')
  );
}

function buildQualityKeyboard(lang, qualityLabels, audioAvailable) {
  const keyboard = new InlineKeyboard();
  for (const label of qualityLabels) {
    keyboard.text(label, `dl:${label}`);
  }
  if (audioAvailable) {
    keyboard.row().text(translations[lang].quality_select.options.audio, 'dl:audio');
  }
  return keyboard;
}

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (!data.startsWith('dl:')) return;

  await ctx.answerCallbackQuery();

  const sourceMsg = ctx.callbackQuery.message;
  const value = data.slice(3);
  if (value === 'audio') {
    await processMedia(ctx, 'best', 'audio', sourceMsg);
  } else {
    await processMedia(ctx, value, 'video+audio', sourceMsg);
  }
});

bot.command('start', async (ctx) => {
  const lang = getLang(ctx);
  pendingMap.delete(ctx.from.id);
  await ctx.reply(translations[lang].greeting);
  await ctx.reply(translations[lang].getting_started);
});

bot.command('donate', async (ctx) => {
  const lang = getLang(ctx);
  await ctx.reply(buildDonateText(lang), { parse_mode: 'HTML' });
});

bot.command('support', async (ctx) => {
  const lang = getLang(ctx);
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
  const lang = getLang(ctx);

  if (!url) {
    await ctx.reply(translations[lang].errors.no_url);
    return;
  }

  try {
    let videos = [];
    let qualityLabels = [];
    let audioAvailable = false;
    let thumbnailUrl = null;
    let caption = null;

    if (isYouTubePlaylist(url)) {
      const playlistId = new URL(url).searchParams.get('list');
      const playlist = await innertube.getPlaylist(playlistId);

      for (const video of playlist.items) {
        if (video.type === 'PlaylistVideo') {
          videos.push({ id: video.id, title: video.title.toString() });
        }
      }

      if (videos.length > 0) {
        const [info, audioInfo] = await Promise.all([
          innertube.getBasicInfo(videos[0].id),
          innertube.getBasicInfo(videos[0].id, 'WEB_EMBEDDED'),
        ]);
        qualityLabels = getQualityLabels(info.streaming_data);
        audioAvailable = hasAudioTrack(audioInfo.streaming_data);
        thumbnailUrl = getBestThumbnailUrl(info.basic_info.thumbnail);
      }

      caption = `📋 <b>${playlist.info.title}</b>`;
    } else {
      const videoId = extractVideoId(url);
      const [info, audioInfo] = await Promise.all([
        innertube.getBasicInfo(videoId),
        innertube.getBasicInfo(videoId, 'WEB_EMBEDDED'),
      ]);
      const title = info.basic_info.title ?? url;

      qualityLabels = getQualityLabels(info.streaming_data);
      audioAvailable = hasAudioTrack(audioInfo.streaming_data);
      thumbnailUrl = getBestThumbnailUrl(info.basic_info.thumbnail);
      videos.push({ id: videoId, title });
      caption = `🎬 <b>${title}</b>`;
    }

    if (videos.length === 0) return;

    pendingMap.set(userId, { videos, thumbnailUrl });

    const keyboard = buildQualityKeyboard(lang, qualityLabels, audioAvailable);

    if (thumbnailUrl) {
      await ctx.replyWithPhoto(thumbnailUrl, { caption, parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  } catch (error) {
    console.error(error);
    if (error.message === 'Invalid URL') {
      await ctx.reply(translations[lang].errors.invalid_url);
    } else {
      await ctx.reply(`${translations[lang].status.error} (${error.message})`);
    }
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
