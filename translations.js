const translations = {
  en: {
    greeting: "Hello! I'm a YouTube video/audio downloader bot.",
    language_select: {
      label: "Please select your language",
      value: "🇬🇧 English",
    },
    getting_started:
      "To download a video/audio from YouTube, send me the URL of the video.",
    manager: {
      text: "Send another url or press 'Download all' button",
      action: "Download all",
    },
    status: {
      searching: "Searching video…",
      found: "Found:",
      downloading: "Downloading…",
      success: "Successfully downloaded!",
      error: "Oops! Something went wrong.",
    },
    errors: {
      no_url: "No url provided.",
    },
    quality_select: {
      label: "Select quality:",
      options: {
        best: "Best",
        audio: "Audio only",
      },
    },
  },
  ru: {
    greeting: "Привет! Я бот для скачивания YouTube видео/аудио.",
    language_select: {
      label: "Пожалуйста, выберите свой язык",
      value: "🇷🇺 Русский",
    },
    getting_started:
      "Чтобы загрузить видео/аудио с YouTube, пришлите мне URL-адрес этого видео.",
    manager: {
      text: 'Добавьте еще видео или нажмите "Скачать все"',
      action: "Скачать все",
    },
    status: {
      searching: "Поиск видео…",
      found: "Найдено:",
      downloading: "Загрузка…",
      success: "Успех!",
      error: "Упс, что-то пошло не так.",
    },
    errors: {
      no_url: "URL-адрес не указан.",
    },
    quality_select: {
      label: "Выберите качество:",
      options: {
        best: "Лучшее",
        audio: "Только аудио",
      },
    },
  },
};

export default translations;
