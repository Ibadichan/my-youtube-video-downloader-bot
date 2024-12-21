function isYouTubePlaylist(url) {
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

module.exports = {
  isYouTubePlaylist,
};
