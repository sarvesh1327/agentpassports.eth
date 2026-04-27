import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep React checks active in development while the demo UI is being built.
  reactStrictMode: true,
  webpack: (config) => {
    // RainbowKit pulls optional wallet transports that are not needed by the injected-wallet MVP path.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false
    };
    return config;
  }
};

export default nextConfig;
