const translations = {
  en: {
    greeting: "Hello! I'm a YouTube video/audio downloader bot.",
    language_select: {
      label: "Please select your language",
      value: "🇬🇧 English",
    },
    getting_started:
      "To download a video/audio from YouTube, send me the URL of the video.\n\n❤️ /donate — support the project\n💬 /support — contact the developer",
    status: {
      searching: "Searching video…",
      found: "Found:",
      downloading: "Downloading…",
      success: "Successfully downloaded!",
      error: "Oops! Something went wrong.",
    },
    errors: {
      no_url: "No url provided.",
      invalid_url: "Copy the video link and send it to the bot 💙",
      session_expired: "Session expired. Please send the link again.",
      file_too_large: "The file is too large for Telegram (max 50 MB). Try a lower quality.",
    },
    quality_select: {
      label: "Select quality:",
      options: {
        best: "Best",
        other: "▼ Other",
        audio: "🎶 Audio",
      },
    },
    donate: {
      label: "Support the bot ❤️",
      appeal: "❤️ This bot and its servers run purely on donations — no ads, no \"subscribe to our channel\" nonsense. If it's useful to you, please consider supporting the project!",
      copied: "Tap an address to copy it.",
      other_payments: "Other payment methods — write me",
    },
    support: {
      label: "Contact and Support",
      email: "Email",
      telegram: "Telegram",
    },
  },
  ru: {
    greeting: "Привет! Я бот для скачивания YouTube видео/аудио.",
    language_select: {
      label: "Пожалуйста, выберите свой язык",
      value: "🇷🇺 Русский",
    },
    getting_started:
      "Чтобы загрузить видео/аудио с YouTube, пришлите мне URL-адрес этого видео.\n\n❤️ /donate — поддержать проект\n💬 /support — связаться с разработчиком",
    status: {
      searching: "Поиск видео…",
      found: "Найдено:",
      downloading: "Загрузка…",
      success: "Успех!",
      error: "Упс, что-то пошло не так.",
    },
    errors: {
      no_url: "URL-адрес не указан.",
      invalid_url: "Скопируй ссылку на видео/фото и отправь боту 💙",
      session_expired: "Сессия устарела. Пожалуйста, отправь ссылку заново.",
      file_too_large: "Файл слишком большой для Telegram (макс. 50 МБ). Попробуй качество ниже.",
    },
    quality_select: {
      label: "Выберите качество:",
      options: {
        best: "Лучшее",
        other: "▼ Другие",
        audio: "🎶 Аудио",
      },
    },
    donate: {
      label: "Поддержать бота ❤️",
      appeal: "❤️ Этот бот и сервера существуют исключительно на пожертвования — без рекламы и просьб подписаться на сторонние каналы. Если бот полезен, поддержите проект!",
      copied: "Нажми на адрес, чтобы скопировать.",
      other_payments: "Другие способы оплаты — напиши мне",
    },
    support: {
      label: "Контакты и поддержка",
      email: "Почта",
      telegram: "Телеграм",
    },
  },
};

export default translations;
