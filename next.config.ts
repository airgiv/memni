import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native / binary packages stay out of the server bundle
  serverExternalPackages: ["sharp", "ffmpeg-static", "ffprobe-static"],
  images: { unoptimized: true },
  // allow opening the dev server from a phone on the same network / inside Telegram tunnels
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app"],
  experimental: { globalNotFound: true },
  async redirects() {
    return [
      // English is the default catalog; the browser language never forces a redirect
      { source: "/", destination: "/en", permanent: false },
      // URLs of the previous prototype
      { source: "/m/:id", destination: "/en/memes/:id", permanent: true },
      { source: "/orders", destination: "/en/videos", permanent: true },
      { source: "/orders/:id", destination: "/en/videos/:id", permanent: true },
      { source: "/people", destination: "/en/people", permanent: true },
      { source: "/:locale(en|ru)/memes", destination: "/:locale", permanent: false },
    ];
  },
};

export default nextConfig;
