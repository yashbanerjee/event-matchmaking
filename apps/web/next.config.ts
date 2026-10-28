import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@em/shared'],
  // Full `next start` (not standalone) so CSS/static assets resolve reliably
  // in the monorepo Docker image on Railway.
  headers: async () => [
    {
      source: '/sw.js',
      headers: [
        {
          key: 'Cache-Control',
          value: 'no-cache, no-store, must-revalidate',
        },
        {
          key: 'Service-Worker-Allowed',
          value: '/',
        },
      ],
    },
    {
      source: '/manifest.webmanifest',
      headers: [
        {
          key: 'Content-Type',
          value: 'application/manifest+json',
        },
      ],
    },
  ],
};

export default nextConfig;
