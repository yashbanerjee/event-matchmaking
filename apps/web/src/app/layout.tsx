import type { CSSProperties, ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Figtree, Syne } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { PwaRegister } from '@/components/pwa-register';

const sans = Figtree({
  subsets: ['latin'],
  variable: '--font-sans-loaded',
  display: 'swap',
});

const display = Syne({
  subsets: ['latin'],
  variable: '--font-display-loaded',
  display: 'swap',
});

const APP_NAME = 'Event Matchmaking';
const APP_DESCRIPTION =
  'Discover who to meet, why you match, connect with requests, and confirm on-site meeting times — built for investors, innovators, and organizers.';

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f766e' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1b2b' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const fontVars = {
    ['--font-sans']: 'var(--font-sans-loaded), system-ui, sans-serif',
    ['--font-display']: 'var(--font-display-loaded), system-ui, sans-serif',
  } as CSSProperties;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable}`} style={fontVars}>
        <Providers>
          {children}
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}
