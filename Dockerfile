# Мемме — one container: the Next.js site + the background video worker.
# State (SQLite, uploads, results, imported meme media) lives on a volume at /data.
FROM node:22-bookworm-slim

# FFmpeg/ffprobe come from the ffmpeg-static / ffprobe-static npm packages (H.264, AAC, VP9, Opus)
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    LOCAL_DATA_DIR=/data/app \
    MEDIA_DIR=/data/media

EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
