import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@em/shared'],
  // Full `next start` (not standalone) so CSS/static assets resolve reliably
  // in the monorepo Docker image on Railway.
};

export default nextConfig;
