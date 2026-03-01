const translations = {
  en: {
    greeting: "Hello! I'm a YouTube video/audio downloader bot.",
    language_select: {
      label: "Please select your language",
      value: "🇬🇧 English",
    },
    getting_started:
      "Send me a YouTube video or playlist link — I'll let you choose the quality.\n\n/donate — support the project\n/help — how to use\n /support — contact developer",
    status: {
      searching: "Searching video…",
      found: "Found:",
      downloading: "Downloading…",
      success: "Successfully downloaded!",
      error: "Oops! Something went wrong.",
    },
    errors: {
      no_url: "No url provided.",
      invalid_url: "Copy the video link and send it to the bot",
      session_expired: "Session expired. Please send the link again.",
      file_too_large: "The file is too large for Telegram (max 50 MB). Try a lower quality.",
      video_too_long: "Video is too long. Max allowed duration:",
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
      label: "Support the project",
      appeal: "⭐ This bot runs purely on donations — no ads, no spam. If it saves you time, consider supporting!",
      keyboard: {
        crypto: "₿ Crypto",
        payments: "💳 Cards & transfers",
        other: "💬 Other",
      },
      crypto_label: "Cryptocurrency",
      payments_label: "Cards & transfers",
      copied: "Tap an address to copy it.",
      other_payments: "Other payment methods — write me",
    },
    support: {
      label: "Contact and Support",
      email: "Email",
      telegram: "Telegram",
    },
    help: {
      text: "📋 <b>How to use the bot</b>\n\nSend a YouTube video or playlist link — I'll show quality options.\n\n<b>Supported:</b>\n• Regular videos\n• Playlists (quality from first video applies to all)\n• Audio-only (great for podcasts and audiobooks)\n\n<b>Limitations:</b>\n• Very long videos can only be downloaded as audio\n• Age-restricted or region-locked videos may fail\n\n<b>If something goes wrong:</b>\n• Try a lower quality\n• Resend the link\n• Use /start to reset if the bot seems stuck",
    },
  },
  ru: {
    greeting: "Привет! Я бот для скачивания YouTube видео/аудио.",
    language_select: {
      label: "Пожалуйста, выберите свой язык",
      value: "🇷🇺 Русский",
    },
    getting_started:
      "Отправь мне ссылку на YouTube видео или плейлист — я предложу выбор качества.\n\n/donate — поддержать проект\n/help — как пользоваться\n /support — связаться с разработчиком",
    status: {
      searching: "Поиск видео…",
      found: "Найдено:",
      downloading: "Загрузка…",
      success: "Успех!",
      error: "Упс, что-то пошло не так.",
    },
    errors: {
      no_url: "URL-адрес не указан.",
      invalid_url: "Скопируй ссылку на видео/фото и отправь боту",
      session_expired: "Сессия устарела. Пожалуйста, отправь ссылку заново.",
      file_too_large: "Файл слишком большой для Telegram (макс. 50 МБ). Попробуй качество ниже.",
      video_too_long: "Видео слишком длинное. Максимальная длительность:",
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
      label: "Поддержать проект",
      appeal: "⭐ Бот существует исключительно на пожертвования — без рекламы и спама. Если полезен — поддержи!",
      keyboard: {
        crypto: "₿ Крипта",
        payments: "💳 Карты и переводы",
        other: "💬 Другое",
      },
      crypto_label: "Криптовалюта",
      payments_label: "Карты и переводы",
      copied: "Нажми на адрес, чтобы скопировать.",
      other_payments: "Другие способы оплаты — напиши мне",
    },
    support: {
      label: "Контакты и поддержка",
      email: "Почта",
      telegram: "Телеграм",
    },
    help: {
      text: "📋 <b>Как пользоваться ботом</b>\n\nОтправь ссылку на YouTube видео или плейлист — я покажу варианты качества.\n\n<b>Поддерживается:</b>\n• Обычные видео\n• Плейлисты (качество выбирается по первому видео)\n• Только аудио (удобно для подкастов и аудиокниг)\n\n<b>Ограничения:</b>\n• Очень длинные видео можно скачать только как аудио\n• Видео с возрастным ограничением или региональной блокировкой могут не работать\n\n<b>Если что-то пошло не так:</b>\n• Попробуй другое качество\n• Отправь ссылку ещё раз\n• Используй /start чтобы сбросить бота, если он завис",
    },
  },
};

export default translations;
