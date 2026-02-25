export function isYouTubePlaylist(url) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.searchParams.has("list") &&
      parsedUrl.pathname.includes("playlist")
    );
  } catch (error) {
    return false;
  }
}

export function extractVideoId(url) {
  const parsedUrl = new URL(url);

  if (parsedUrl.hostname === 'youtu.be') {
    return parsedUrl.pathname.slice(1);
  }

  if (parsedUrl.pathname.startsWith('/shorts/')) {
    return parsedUrl.pathname.split('/shorts/')[1];
  }

  return parsedUrl.searchParams.get('v');
}
