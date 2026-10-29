import type { CSSProperties, ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Figtree, Syne } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { PwaRegister } from '@/components/pwa-register';
import { DemoFooter } from '@/components/demo-footer';
import { brandLabel, BRAND } from '@/lib/brand';

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

const APP_NAME = brandLabel;
const APP_DESCRIPTION = `${BRAND.tagline}. Event matchmaking demo for Ethara — discover, match, connect, and meet.`;

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · ${BRAND.name}`,
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
    { media: '(prefers-color-scheme: light)', color: '#26e2c6' },
    { media: '(prefers-color-scheme: dark)', color: '#1bc4ab' },
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
          <DemoFooter />
          {children}
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}
