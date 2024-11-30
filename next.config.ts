import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  experimental: {
    largePageDataBytes: 12000 * 1000,
  }
};

export default nextConfig;
