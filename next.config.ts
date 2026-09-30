import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native / binary packages stay out of the server bundle
  serverExternalPackages: ["sharp", "ffmpeg-static", "ffprobe-static"],
  images: { unoptimized: true },
  // allow opening the dev server from a phone on the same network / inside Telegram tunnels
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app"],
};

export default nextConfig;
