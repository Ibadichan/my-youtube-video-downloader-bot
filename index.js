import 'dotenv/config';

import { createWriteStream, createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { pipeline } from 'stream/promises';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { Innertube, Platform, UniversalCache, Utils } from 'youtubei.js';
import { Bot, InputFile, InlineKeyboard, webhookCallback } from 'grammy';
import express from 'express';
import translations from './translations.js';
import { isYouTubePlaylist, extractVideoId } from './utils.js';

const execFileAsync = promisify(execFile);

const FFMPEG_PATH = (() => {
  try { return execSync('which ffmpeg').toString().trim(); } catch { return 'ffmpeg'; }
})();
console.log('ffmpeg path:', FFMPEG_PATH);

async function writeStreamToFile(stream, filePath) {
  await pipeline(Utils.streamToIterable(stream), createWriteStream(filePath));
}

async function mergeVideoAudio(videoStream, audioStream) {
  const prefix = join(tmpdir(), randomBytes(8).toString('hex'));
  const videoPath = `${prefix}_v.mp4`;
  const audioPath = `${prefix}_a.mp4`;
  const outputPath = `${prefix}_out.mp4`;

  try {
    await Promise.all([
      writeStreamToFile(videoStream, videoPath),
      writeStreamToFile(audioStream, audioPath),
    ]);

    await execFileAsync(FFMPEG_PATH, [
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-movflags', 'faststart',
      outputPath,
    ]);

    return outputPath;
  } finally {
    await Promise.all([
      unlink(videoPath).catch(() => {}),
      unlink(audioPath).catch(() => {}),
    ]);
  }
}

Platform.shim.eval = (data, env) => {
  const properties = [];

  if (env.n) {
    properties.push(`n: exportedVars.nFunction("${env.n}")`);
  }

  if (env.sig) {
    properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  }

  const code = `${data.output}\nreturn { ${properties.join(', ')} }`;

  try {
    return new Function(code)();
  } catch (e) {
    console.error('[shim.eval] decipher failed:', e.message);
    throw e;
  }
};

const { 
  TELEGRAM_TOKEN,
  TELEGRAM_WEBHOOK_URL,
  TELEGRAM_API_URL,
  YOUTUBE_COOKIE,
  DONATE_CARD,
  DONATE_PEREVODILKA,
  BOT_USERNAME,
} = process.env;

const WALLETS = {
  BTC:        '1KgxUoCK87hPrLVDXYwpQzZqS6Mus7D6N8',
  ETH:        '0xb0db7cb3c18a02c969416d4ec06bdd703d1756f8',
  TON:        'UQBuvR1J5N6XOlA2tuQ0xMT1OgAp6XG0BAEuap3zNHhrb6ba',
  USDT_TRC20: 'TQze9DixKds37maVgmnuVENnUDT7UynaRy',
};

const innertube = await Innertube.create({
  cookie: YOUTUBE_COOKIE,
  cache: new UniversalCache(false),
});
console.log('Innertube initialized');

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
    ...(DONATE_CARD ? [`💳 Visa/Mastercard:\n<code>${DONATE_CARD}</code>`] : []),
    ...(DONATE_PEREVODILKA ? [`💸 Perevodilka PMR:\n<code>${DONATE_PEREVODILKA}</code>`] : []),
    '',
    `<i>${t.copied}</i>`,
    '',
    `<i>${t.other_payments}</i>`,
    `<a href="https://t.me/ibadichan">📬 @ibadichan</a>`,
  ].join('\n');
}

const bot = new Bot(TELEGRAM_TOKEN, {
  client: { apiRoot: TELEGRAM_API_URL },
});

bot.catch((err) => console.error('Unhandled bot error:', err));

async function processMedia(ctx, quality, type = 'video+audio', sourceMsg = null) {
  const userId = ctx.from.id;
  const lang = getLang(ctx);
  const entry = pendingMap.get(userId);

  if (!entry) {
    await ctx.reply(translations[lang].errors.session_expired);
    return;
  }

  const { videos: videoList, thumbnailUrl } = entry;
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

  while (videoList.length > 0) {
    const { id, title } = videoList.at(-1);
    let videoStream, audioStream;

    try {
      if (type === 'audio') {
        audioStream = await downloadAudioOnly(id);
        const audioCaption = BOT_USERNAME ? `💙 @${BOT_USERNAME}` : undefined;
        await ctx.replyWithAudio(new InputFile(Utils.streamToIterable(audioStream), 'audio.mp3'), { title, caption: audioCaption });
      } else {
        const dlResult = await downloadVideoAudio(id, quality);
        ({ videoStream, audioStream } = dlResult);

        const qualityLabel = dlResult.isMuxed ? '360p (fallback)' : quality;
        const caption = [
          `🎬 <b>${title}</b>`,
          `🔗 https://youtu.be/${id}`,
          `📥 ${qualityLabel}`,
          ...(BOT_USERNAME ? [`💙 @${BOT_USERNAME}`] : []),
        ].join('\n');

        if (dlResult.isMuxed) {
          // Stream directly — no disk write needed
          await ctx.replyWithVideo(new InputFile(Utils.streamToIterable(videoStream), 'video.mp4'), { caption, parse_mode: 'HTML' });
        } else {
          const outputPath = await mergeVideoAudio(videoStream, audioStream);
          try {
            await ctx.replyWithVideo(new InputFile(createReadStream(outputPath), 'video.mp4'), { caption, parse_mode: 'HTML' });
          } finally {
            await unlink(outputPath).catch(() => {});
          }
        }
      }
    } catch (error) {
      errorSize += 1;
      console.error(error);
      try { await videoStream?.cancel(); } catch {}
      try { await audioStream?.cancel(); } catch {}
      const msg = error.error_code === 413
        ? translations[lang].errors.file_too_large
        : `${translations[lang].status.error} (${error.message})`;
      await ctx.reply(msg);
    }

    videoList.pop();
  }

  if (infoMsg) {
    try {
      await ctx.api.deleteMessage(infoMsg.chat.id, infoMsg.message_id);
    } catch (e) {
      console.error('Failed to delete loading message:', e);
    }
  }

  console.log(`[user:${userId}] done: ${size - errorSize}/${size} ok`);

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
    (streamingData?.adaptive_formats ?? [])
      .filter((f) => f.mime_type?.startsWith('video/'))
      .map((f) => f.quality_label)
      .filter(Boolean)
  )];
  return labels
    .filter((l) => parseInt(l) >= 360 && !l.toUpperCase().includes('HDR'))
    .sort((a, b) => parseInt(a) - parseInt(b));
}

function hasAudioTrack(streamingData) {
  return (streamingData?.adaptive_formats ?? []).some(
    (f) => f.mime_type?.startsWith('audio/')
  );
}

// Tries WEB_EMBEDDED first (avoids login-required), falls back to WEB (for non-embeddable videos)
async function getVideoInfoSafe(videoId) {
  const [webResult, embeddedResult] = await Promise.allSettled([
    innertube.getBasicInfo(videoId),
    innertube.getBasicInfo(videoId, 'WEB_EMBEDDED'),
  ]);
  const web = webResult.status === 'fulfilled' ? webResult.value : null;
  const embedded = embeddedResult.status === 'fulfilled' ? embeddedResult.value : null;
  if (!web && !embedded) {
    console.error(`getBasicInfo failed for ${videoId} — WEB: ${webResult.reason?.message} | WEB_EMBEDDED: ${embeddedResult.reason?.message}`);
    throw webResult.reason;
  }
  return { web: web ?? embedded, embedded: embedded ?? web };
}

const DOWNLOAD_CLIENTS = ['WEB_EMBEDDED', 'WEB', 'MWEB', 'TV_EMBEDDED'];

async function downloadVideoAudio(id, quality) {
  let lastError;
  for (const client of DOWNLOAD_CLIENTS) {
    let videoStream;
    try {
      videoStream = await innertube.download(id, { type: 'video', quality, client });
      const audioStream = await innertube.download(id, { type: 'audio', quality: 'best', client });
      console.log(`[${client}] adaptive OK: ${id} (${quality})`);
      return { videoStream, audioStream };
    } catch (e) {
      try { await videoStream?.cancel(); } catch {}
      lastError = e;
      console.warn(`[${client}] adaptive failed for ${id} (${quality}): ${e.message}`);
    }
  }
  // Muxed fallback: pre-merged stream (usually ≤360p), may bypass decipher issues
  for (const client of DOWNLOAD_CLIENTS) {
    try {
      const stream = await innertube.download(id, { type: 'video+audio', client });
      console.log(`[${client}] muxed fallback OK: ${id}`);
      return { videoStream: stream, isMuxed: true };
    } catch (e) {
      console.warn(`[${client}] muxed fallback failed for ${id}: ${e.message}`);
    }
  }
  console.error(`All clients failed for ${id} (${quality}): ${lastError?.message}`);
  throw lastError;
}

async function downloadAudioOnly(id) {
  let lastError;
  for (const client of DOWNLOAD_CLIENTS) {
    try {
      const stream = await innertube.download(id, { type: 'audio', quality: 'best', client });
      console.log(`[${client}] audio OK: ${id}`);
      return stream;
    } catch (e) {
      lastError = e;
      console.warn(`[${client}] audio failed for ${id}: ${e.message}`);
    }
  }
  console.error(`All clients failed for audio ${id}: ${lastError?.message}`);
  throw lastError;
}

const MAIN_RESOLUTIONS = [360, 480, 720, 1080];

function buildQualityKeyboard(lang, qualityLabels, audioAvailable, showAll = false) {
  const keyboard = new InlineKeyboard();
  // For each main resolution pick the first matching label (e.g. "1080p60" if "1080p" is absent)
  const mainLabels = MAIN_RESOLUTIONS
    .map((res) => qualityLabels.find((l) => parseInt(l) === res))
    .filter(Boolean);
  const mainSet = new Set(mainLabels);
  const extraLabels = qualityLabels.filter((l) => !mainSet.has(l));
  const toShow = (showAll || mainLabels.length === 0) ? qualityLabels : mainLabels;

  toShow.forEach((label, i) => {
    if (i > 0 && i % 4 === 0) keyboard.row();
    keyboard.text(`🎬 ${label}`, `dl:${label}`);
  });

  if (!showAll && mainLabels.length > 0 && extraLabels.length > 0) {
    keyboard.row().text(translations[lang].quality_select.options.other, 'dl:more');
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

  const lang = getLang(ctx);
  const value = data.slice(3);

  if (value === 'more') {
    const entry = pendingMap.get(ctx.from.id);
    if (!entry) return;
    const keyboard = buildQualityKeyboard(lang, entry.qualityLabels, entry.audioAvailable, true);
    await ctx.editMessageReplyMarkup({ reply_markup: keyboard }).catch((e) => {
      if (e.error_code !== 400) throw e;
    });
    return;
  }

  const sourceMsg = ctx.callbackQuery.message;
  if (value === 'audio') {
    processMedia(ctx, 'best', 'audio', sourceMsg).catch(console.error);
  } else {
    processMedia(ctx, value, 'video+audio', sourceMsg).catch(console.error);
  }
});

bot.command('start', async (ctx) => {
  const lang = getLang(ctx);
  pendingMap.delete(ctx.from.id);
  await ctx.reply(translations[lang].greeting);
  await ctx.reply(translations[lang].getting_started);
  await ctx.reply(translations[lang].donate.appeal);
  await ctx.reply(buildDonateText(lang), { parse_mode: 'HTML' });
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

  console.log(`[user:${userId}] message: ${url}`);

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
        const { web: info, embedded: audioInfo } = await getVideoInfoSafe(videos[0].id);
        qualityLabels = getQualityLabels(audioInfo.streaming_data);
        audioAvailable = hasAudioTrack(audioInfo.streaming_data);
        thumbnailUrl = getBestThumbnailUrl(info.basic_info.thumbnail);
      }

      caption = `📋 <b>${playlist.info.title}</b>`;
    } else {
      const videoId = extractVideoId(url);
      const { web: info, embedded: audioInfo } = await getVideoInfoSafe(videoId);
      const title = info.basic_info.title ?? url;

      qualityLabels = getQualityLabels(audioInfo.streaming_data);
      audioAvailable = hasAudioTrack(audioInfo.streaming_data);
      thumbnailUrl = getBestThumbnailUrl(info.basic_info.thumbnail);
      videos.push({ id: videoId, title });
      caption = `🎬 <b>${title}</b>`;
    }

    if (videos.length === 0) return;

    pendingMap.set(userId, { videos, thumbnailUrl, qualityLabels, audioAvailable });

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
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    await bot.api.setWebhook(TELEGRAM_WEBHOOK_URL);
    console.log('Webhook set:', TELEGRAM_WEBHOOK_URL);
  } catch (err) {
    console.error('Failed to set webhook:', err);
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
