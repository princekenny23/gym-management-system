import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["192.168.1.227"],
  async rewrites() {
    const djangoApiUrl = process.env.DJANGO_API_URL;
    if (!djangoApiUrl) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${djangoApiUrl.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
