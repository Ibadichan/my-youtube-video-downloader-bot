import 'dotenv/config';

import { createReadStream, existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { Bot, InputFile, InlineKeyboard, webhookCallback } from 'grammy';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import translations from './translations.js';
import { isYouTubeUrl, isYouTubePlaylist, extractVideoId } from './utils.js';

const execFileAsync = promisify(execFile);

const YTDLP_PATH = (() => {
  try { return execSync('which yt-dlp').toString().trim(); } catch { return 'yt-dlp'; }
})();
console.log('yt-dlp path:', YTDLP_PATH);

const FFMPEG_PATH = (() => {
  try { return execSync('which ffmpeg').toString().trim(); } catch { return 'ffmpeg'; }
})();
console.log('ffmpeg path:', FFMPEG_PATH);

const {
  TELEGRAM_TOKEN,
  TELEGRAM_WEBHOOK_URL,
  TELEGRAM_API_URL,
  DONATE_CARD,
  DONATE_PEREVODILKA,
  BOT_USERNAME,
} = process.env;

const MAX_VIDEO_DURATION_SEC = process.env.MAX_VIDEO_DURATION_MIN
  ? Number(process.env.MAX_VIDEO_DURATION_MIN) * 60
  : null;

const WALLETS = {
  BTC:        '1KgxUoCK87hPrLVDXYwpQzZqS6Mus7D6N8',
  ETH:        '0xb0db7cb3c18a02c969416d4ec06bdd703d1756f8',
  TON:        'UQBuvR1J5N6XOlA2tuQ0xMT1OgAp6XG0BAEuap3zNHhrb6ba',
  USDT_TRC20: 'TQze9DixKds37maVgmnuVENnUDT7UynaRy',
};

const COOKIES_FILE = process.env.COOKIES_FILE ?? 'cookies.txt';

function buildYtdlpArgs(extraArgs = []) {
  const args = ['--no-check-certificates', '--js-runtimes', `node:${process.execPath}`, '--remote-components', 'ejs:github'];
  if (FFMPEG_PATH && FFMPEG_PATH !== 'ffmpeg') {
    args.push('--ffmpeg-location', FFMPEG_PATH);
  }
  if (existsSync(COOKIES_FILE)) {
    args.push('--cookies', COOKIES_FILE);
  }
  // if (PROXY_URL) {
  //   args.push('--proxy', PROXY_URL);
  // }
  return [...args, ...extraArgs];
}

async function getVideoInfo(url) {
  const args = buildYtdlpArgs(['--dump-json', '--no-playlist', url]);
  const { stdout } = await execFileAsync(YTDLP_PATH, args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });
  return JSON.parse(stdout);
}

async function getPlaylistInfo(playlistUrl) {
  const args = buildYtdlpArgs([
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    playlistUrl,
  ]);
  const { stdout } = await execFileAsync(YTDLP_PATH, args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 60_000,
  });
  return JSON.parse(stdout);
}

function getQualityLabels(info) {
  const heights = [...new Set(
    (info.formats ?? [])
      .filter((f) => f.vcodec && f.vcodec !== 'none' && f.height &&
                     (!f.dynamic_range || f.dynamic_range === 'SDR'))
      .map((f) => f.height)
  )];
  return heights
    .filter((h) => h >= 360)
    .sort((a, b) => a - b)
    .map((h) => `${h}p`);
}

function hasAudioTrack(info) {
  return (info.formats ?? []).some(
    (f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
  );
}

function getBestThumbnailUrl(info) {
  return info.thumbnail ?? null;
}

async function downloadVideoAudio(url, qualityLabel) {
  const height = parseInt(qualityLabel);
  const prefix = join(tmpdir(), randomBytes(8).toString('hex'));
  const outputPath = `${prefix}.mp4`;

  const formatSelector = height
    ? [
        `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]`,
        `bestvideo[height<=${height}]+bestaudio`,
        `best[height<=${height}]`,
        'best',
      ].join('/')
    : 'best';

  const args = buildYtdlpArgs([
    '-f', formatSelector,
    '--merge-output-format', 'mp4',
    '-o', outputPath,
    '--no-playlist',
    url,
  ]);

  await execFileAsync(YTDLP_PATH, args, { timeout: 10 * 60_000, maxBuffer: 1024 * 1024 });
  return outputPath;
}

async function downloadAudioOnly(url) {
  const prefix = join(tmpdir(), randomBytes(8).toString('hex'));

  const args = buildYtdlpArgs([
    '-f', 'bestaudio[ext=m4a]/bestaudio',
    '-x',
    '--audio-format', 'mp3',
    '-o', `${prefix}.%(ext)s`,
    '--print', 'after_move:filepath',
    '--no-playlist',
    url,
  ]);

  const { stdout } = await execFileAsync(YTDLP_PATH, args, { timeout: 10 * 60_000, maxBuffer: 1024 * 1024 });
  const outputPath = stdout.trim().split('\n').at(-1).trim() || `${prefix}.mp3`;
  return outputPath;
}

const pendingMap = new Map(); // Map<userId, { videos: { url, title }[], thumbnailUrl, qualityLabels, audioAvailable, duration }>
const downloadCountMap = new Map(); // Map<userId, number>

function getLang(ctx) {
  return ctx.from?.language_code === 'ru' ? 'ru' : 'en';
}

function buildCryptoText(lang) {
  const t = translations[lang].donate;
  return [
    `<b>${t.crypto_label}</b>`,
    '',
    `₿ BTC (BTC):\n<code>${WALLETS.BTC}</code>`,
    `⟠ ETH (ERC20):\n<code>${WALLETS.ETH}</code>`,
    `ꘜ TON (TON):\n<code>${WALLETS.TON}</code>`,
    `₮ USDT (TRC20):\n<code>${WALLETS.USDT_TRC20}</code>`,
    '',
    `<i>${t.copied}</i>`,
  ].join('\n');
}

function buildPaymentsText(lang) {
  const t = translations[lang].donate;
  const lines = [`<b>${t.payments_label}</b>`, ''];
  if (DONATE_CARD) lines.push(`💳 Visa/Mastercard:\n<code>${DONATE_CARD}</code>`);
  if (DONATE_PEREVODILKA) lines.push(`💸 Perevodilka PMR:\n<code>${DONATE_PEREVODILKA}</code>`);
  lines.push('', `<i>${t.copied}</i>`);
  return lines.join('\n');
}

function buildSupportText(lang) {
  const t = translations[lang].support;
  return [
    `<b>${t.label}</b>`,
    '',
    `📧 ${t.email}: <code>badican01117@gmail.com</code>`,
    `📬 ${t.telegram}: <a href="https://t.me/ibadichan">t.me/ibadichan</a>`,
  ].join('\n');
}

function buildDonateKeyboard(lang) {
  const k = translations[lang].donate.keyboard;
  return new InlineKeyboard()
    .text(k.crypto, 'donate:crypto')
    .text(k.payments, 'donate:payments')
    .text(k.other, 'donate:other');
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

  const { videos: videoList, thumbnailUrl, duration } = entry;

  if (type !== 'audio' && MAX_VIDEO_DURATION_SEC && duration && duration > MAX_VIDEO_DURATION_SEC) {
    const maxMin = Math.round(MAX_VIDEO_DURATION_SEC / 60);
    const durationMin = Math.ceil(duration / 60);
    await ctx.reply(`${translations[lang].errors.video_too_long} ${maxMin} min (video: ${durationMin} min)`);
    return;
  }

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
    const { url, title } = videoList.at(-1);
    let outputPath = null;

    try {
      if (type === 'audio') {
        outputPath = await downloadAudioOnly(url);
        const audioCaption = BOT_USERNAME ? `💙 @${BOT_USERNAME}` : undefined;
        await ctx.replyWithAudio(
          new InputFile(createReadStream(outputPath), 'audio.mp3'),
          { title, caption: audioCaption }
        );
      } else {
        outputPath = await downloadVideoAudio(url, quality);
        const captionLines = [`⭐ <b>${title}</b>`];
        if (quality) captionLines.push(`📥 ${quality}`);
        if (BOT_USERNAME) captionLines.push(`💙 @${BOT_USERNAME}`);
        await ctx.replyWithVideo(
          new InputFile(createReadStream(outputPath), 'video.mp4'),
          { caption: captionLines.join('\n'), parse_mode: 'HTML' }
        );
      }
    } catch (error) {
      errorSize += 1;
      console.error(error);
      const brief = (error.message ?? '').split('\n')[0].slice(0, 200);
      const msg = error.error_code === 413
        ? translations[lang].errors.file_too_large
        : `${translations[lang].status.error} (${brief})`;
      await ctx.reply(msg);
    } finally {
      if (outputPath) await unlink(outputPath).catch(() => {});
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
    await ctx.reply(translations[lang].donate.appeal, { reply_markup: buildDonateKeyboard(lang) });
  }
}

const MAIN_RESOLUTIONS = [360, 480, 720, 1080];

function buildQualityKeyboard(lang, qualityLabels, audioAvailable, showAll = false) {
  const keyboard = new InlineKeyboard();
  const mainLabels = MAIN_RESOLUTIONS
    .map((res) => qualityLabels.find((l) => parseInt(l) === res))
    .filter(Boolean);
  const mainSet = new Set(mainLabels);
  const extraLabels = qualityLabels.filter((l) => !mainSet.has(l));
  const toShow = (showAll || mainLabels.length === 0) ? qualityLabels : mainLabels;

  if (toShow.length === 0) {
    // No quality info available (e.g. some platforms) — offer a single download button
    keyboard.text(`🎬 ${translations[lang].quality_select.options.best}`, 'dl:best');
  } else {
    toShow.forEach((label, i) => {
      if (i > 0 && i % 4 === 0) keyboard.row();
      keyboard.text(`🎬 ${label}`, `dl:${label}`);
    });

    if (!showAll && mainLabels.length > 0 && extraLabels.length > 0) {
      keyboard.row().text(translations[lang].quality_select.options.other, 'dl:more');
    }
  }

  if (audioAvailable) {
    keyboard.row().text(translations[lang].quality_select.options.audio, 'dl:audio');
  }

  return keyboard;
}

bot.callbackQuery(/^dl:/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const lang = getLang(ctx);
  const value = ctx.callbackQuery.data.slice(3);

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
    processMedia(ctx, value === 'best' ? null : value, 'video+audio', sourceMsg).catch(console.error);
  }
});

bot.command('start', async (ctx) => {
  const lang = getLang(ctx);
  pendingMap.delete(ctx.from.id);
  await ctx.reply(translations[lang].greeting);
  await ctx.reply(translations[lang].getting_started);
  await ctx.reply(translations[lang].donate.appeal, { reply_markup: buildDonateKeyboard(lang) });
});

bot.command('donate', async (ctx) => {
  const lang = getLang(ctx);
  await ctx.reply(translations[lang].donate.appeal, { reply_markup: buildDonateKeyboard(lang) });
});

bot.command('support', async (ctx) => {
  const lang = getLang(ctx);
  await ctx.reply(buildSupportText(lang), { parse_mode: 'HTML' });
});

bot.command('help', async (ctx) => {
  const lang = getLang(ctx);
  await ctx.reply(translations[lang].help.text, { parse_mode: 'HTML' });
});

bot.callbackQuery('donate:crypto', async (ctx) => {
  const lang = getLang(ctx);
  await ctx.answerCallbackQuery();
  await ctx.reply(buildCryptoText(lang), { parse_mode: 'HTML' });
});

bot.callbackQuery('donate:payments', async (ctx) => {
  const lang = getLang(ctx);
  await ctx.answerCallbackQuery();
  await ctx.reply(buildPaymentsText(lang), { parse_mode: 'HTML' });
});

bot.callbackQuery('donate:other', async (ctx) => {
  const lang = getLang(ctx);
  await ctx.answerCallbackQuery();
  await ctx.reply(buildSupportText(lang), { parse_mode: 'HTML' });
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
    new URL(url); // validate URL syntax
  } catch {
    await ctx.reply(translations[lang].errors.invalid_url);
    return;
  }

  try {
    let videos = [];
    let qualityLabels = [];
    let audioAvailable = false;
    let thumbnailUrl = null;
    let caption = null;
    let duration = null;

    if (isYouTubePlaylist(url)) {
      const playlist = await getPlaylistInfo(url);

      for (const entry of (playlist.entries ?? [])) {
        if (entry.id) {
          videos.push({
            url: `https://www.youtube.com/watch?v=${entry.id}`,
            title: entry.title ?? entry.id,
          });
        }
      }

      if (videos.length > 0) {
        const info = await getVideoInfo(videos[0].url);
        qualityLabels = getQualityLabels(info);
        audioAvailable = hasAudioTrack(info);
        thumbnailUrl = getBestThumbnailUrl(info);
      }

      caption = `📋 <b>${playlist.title ?? 'Playlist'}</b>`;
    } else {
      const info = await getVideoInfo(url);
      const title = info.title ?? url;
      duration = info.duration ?? null;
      qualityLabels = getQualityLabels(info);
      audioAvailable = hasAudioTrack(info);
      thumbnailUrl = getBestThumbnailUrl(info);
      // Normalise YouTube URLs to canonical form; keep other URLs as-is
      const canonicalUrl = isYouTubeUrl(url)
        ? `https://www.youtube.com/watch?v=${extractVideoId(url)}`
        : url;
      videos.push({ url: canonicalUrl, title });
      caption = `⭐ <b>${title}</b>`;
    }

    if (videos.length === 0) return;

    pendingMap.set(userId, { videos, thumbnailUrl, qualityLabels, audioAvailable, duration });

    const keyboard = buildQualityKeyboard(lang, qualityLabels, audioAvailable);

    if (thumbnailUrl) {
      await ctx.replyWithPhoto(thumbnailUrl, { caption, parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  } catch (error) {
    console.error(error);
    const brief = (error.message ?? '').split('\n')[0].slice(0, 200);
    await ctx.reply(`${translations[lang].status.error} (${brief})`);
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
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));
  app.use(webhookCallback(bot, 'express'));

  const PORT = process.env.PORT || 3000;

  app.get('/health', (_req, res) => {
    res.send('Bot is running');
  });

  app.listen(PORT, () => {
    console.log(`Bot listening on port ${PORT}`);
  });

  setupWebhook();
} else {
  // Use Long Polling for development
  bot.start({ drop_pending_updates: true });
}
