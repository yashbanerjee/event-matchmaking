import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { Figtree, Syne } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

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

export const metadata: Metadata = {
  title: 'Event Matchmaking',
  description: 'Enterprise company and vendor matchmaking platform',
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
