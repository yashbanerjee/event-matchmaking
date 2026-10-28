import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Event Matchmaking',
    short_name: 'MatchMeet',
    description:
      'Discover, match, connect, and meet — intelligent conference matchmaking for investors, innovators, and organizers.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#eef3f7',
    theme_color: '#0f766e',
    categories: ['business', 'productivity'],
    lang: 'en',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
