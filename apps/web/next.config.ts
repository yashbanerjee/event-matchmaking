import fs from 'fs';
import path from 'path';
import type { NextConfig } from 'next';

function packageNamesUnder(scopeDir: string, scope: string): string[] {
  try {
    return fs
      .readdirSync(scopeDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${scope}/${entry.name}`);
  } catch {
    return [];
  }
}

const atlaskitRoot = path.join(__dirname, '../../node_modules/@atlaskit');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@em/shared',
    '@compiled/react',
    ...packageNamesUnder(atlaskitRoot, '@atlaskit'),
  ],
  // Full `next start` (not standalone) so CSS/static assets resolve reliably
  // in the monorepo Docker image on Railway.
};

export default nextConfig;
