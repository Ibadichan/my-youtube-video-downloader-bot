FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip && \
    pip3 install --break-system-packages yt-dlp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN corepack enable && pnpm install --production

COPY . .

ENV NODE_ENV=production

CMD ["node", "index.js"]
