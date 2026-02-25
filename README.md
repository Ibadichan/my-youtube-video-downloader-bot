# my-youtube-video-downloader-bot

Telegram-бот для скачивания видео и аудио с YouTube.

## Установка

```bash
pnpm install
```

## Переменные окружения

Создай файл `.env` в корне проекта:

```env
TELEGRAM_TOKEN=твой_токен_от_BotFather

# Только для прода
TELEGRAM_WEBHOOK_URL=https://твой-домен.com/bot

# Куки YouTube (строка формата "name1=val1; name2=val2; ...")
YOUTUBE_COOKIE=
```

Куки нужны для доступа к ограниченным видео.

## Запуск в режиме разработки

Используется long polling — webhook не нужен.

```bash
pnpm dev
```

## Запуск в продакшене

Используется webhook. Убедись, что в `.env` задан `TELEGRAM_WEBHOOK_URL`.

```bash
pnpm start
```

Бот поднимает Express-сервер на порту из переменной `PORT` (по умолчанию `3000`) и автоматически регистрирует webhook в Telegram.
