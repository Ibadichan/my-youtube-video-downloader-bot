const cookiesString = `__Secure-1PSIDTS=sidts-CjEB7pHptTJGVH_hbk0x3A_1sWJnp7IGrUvM7gu_yyRTe9Q8hq-L_mlZ6aSVuEQzlgSBEAA; __Secure-3PSIDTS=sidts-CjEB7pHptTJGVH_hbk0x3A_1sWJnp7IGrUvM7gu_yyRTe9Q8hq-L_mlZ6aSVuEQzlgSBEAA; HSID=AD_6GL30iN3Y5CsqF; SSID=AHuPXL83DSeLvzHYn; APISID=bxj1APOpWb7lJ1hY/AVHNnTlY8jEBaRgn5; SAPISID=sSBLW5tiy7ejV7hj/AP-XMkGRMf-17VHCS; __Secure-1PAPISID=sSBLW5tiy7ejV7hj/AP-XMkGRMf-17VHCS; __Secure-3PAPISID=sSBLW5tiy7ejV7hj/AP-XMkGRMf-17VHCS; LOGIN_INFO=AFmmF2swRgIhAItuTJcVF-3MJ3KsKUu4s4m39yrjfEB-jOhZJHF3XMQnAiEAjlB0f0IAGNFThq7oTIVGzceQEwbLTxJYPAV_xPwgBRY:QUQ3MjNmd2JvdmZ1b3hra1RwT2lfbXVyWGNCRzBCZWlodDd2STRJV21aUXhIeEJ1NEpCcTBvY0RyNTRYdUREdTJxWE5BNERYUXFrSXZCV2p1SzAwcGhNU3RDRkQ2U1dXaVlqVC02dlFCOGUxd2tvZTN6Yy15c3FjT2VKbnNhemVkd1g2eG55c2k1Wm5yZEhpb29QdGp0UTNjUnRiYXd4N3hR; YSC=XdgT2IOWEc8; VISITOR_INFO1_LIVE=0YuQzKzJjBo; VISITOR_PRIVACY_METADATA=CgJNRBIEGgAgRA%3D%3D; __Secure-ROLLOUT_TOKEN=CJ-vkOOer8DjSxDAp7eouZmMAxju_MepuZmMAw%3D%3D; SID=g.a000vAjxGzXpxjjr_xpUYxl07E-8TK78BrtKLMnphNdIBGvhNJ8BdVCKUQ29PdG-gbqYgGCn4QACgYKAXISARASFQHGX2MiEfSSv7TBHBcjExH-_-MY9RoVAUF8yKr4Fv3RBcnNyo64pDK5Hrj80076; __Secure-1PSID=g.a000vAjxGzXpxjjr_xpUYxl07E-8TK78BrtKLMnphNdIBGvhNJ8Bo4t5drGTrjxQUZe26NTqYAACgYKARcSARASFQHGX2MiBMr6DqIdWaJ-5HqA11VJTRoVAUF8yKr-gl0Z3R9xcodxcBoBRF880076; __Secure-3PSID=g.a000vAjxGzXpxjjr_xpUYxl07E-8TK78BrtKLMnphNdIBGvhNJ8Be7sKruD8vGuE9yh0DW4vhgACgYKAWASARASFQHGX2MiosBW3cI1ZotEI9J1xgCcEBoVAUF8yKprnO2nZiQ1z6462Yms1tbG0076; PREF=tz=Europe.Chisinau&f4=4000000; SIDCC=AKEyXzXJEdpnutxDQPuSyIBP4J3CynTF8spKRgnBy4DqI07nXGQ5FsJCgBByS14lrfq9ydweHA; __Secure-1PSIDCC=AKEyXzX4RycO-yj9S17QB978PRD2enIzmjaaXndDVeCuFwz0SVmY6o2K8jrsGErEX4ZHZgJ4; __Secure-3PSIDCC=AKEyXzVxG4vsyakX3IVX6joY6kqSEWsRY7YeUUx5wfACnEa7yPSa_Bvm9h8cI7R80Iujfahw`;

const domain = ".youtube.com";

const cookies = cookiesString.split("; ").map((cookie) => {
  const [name, ...valueParts] = cookie.split("=");
  const value = valueParts.join("=");

  return {
    domain,
    expirationDate: Math.floor(Date.now() / 1000) + 3600 * 24 * 30,
    hostOnly: false,
    httpOnly: name.startsWith("__Secure-") || name.includes("SID"),
    name,
    path: "/",
    sameSite: "no_restriction",
    secure: true,
    session: false,
    value,
  };
});

module.exports = cookies;
