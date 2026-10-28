import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@em/shared'],
  output: 'standalone',
};

export default nextConfig;
