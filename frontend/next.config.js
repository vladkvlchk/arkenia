/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "encoding");
    // Stub out Solana/Farcaster optional deps pulled in by @privy-io/react-auth
    config.resolve.alias["@solana/wallet-adapter-react"] = false;
    config.resolve.alias["@farcaster/mini-app-solana"] = false;
    return config;
  },
};

module.exports = nextConfig;
