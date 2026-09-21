import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "images.underarmour.com" },
      { protocol: "https", hostname: "underarmour.scene7.com" },
    ],
  },
};

export default nextConfig;
