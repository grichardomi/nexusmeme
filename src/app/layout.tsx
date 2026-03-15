import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { Header } from '@/components/layouts/Header';
import { AppInitializer } from '@/components/AppInitializer';
import { PWARegister } from '@/components/PWARegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'NexusMeme - AI Crypto Trading Bot | Pay Only on Profits',
  description: 'AI-powered crypto trading bots for BTC & ETH on Binance International. Available globally. Performance fee only — pay nothing when the bot loses.',
  keywords: 'crypto trading bot, AI trading bot, Binance trading bot, automated crypto trading, performance fee trading, BTC ETH trading bot, global crypto bot, algorithmic trading, no subscription trading bot',
  authors: [{ name: 'NexusMeme' }],
  creator: 'NexusMeme',
  publisher: 'NexusMeme',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  metadataBase: new URL('https://nexusmeme.com'),
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://nexusmeme.com',
    siteName: 'NexusMeme',
    title: 'NexusMeme - AI Crypto Trading Bot | Pay Only on Profits',
    description: 'AI-powered trading bots on Binance International. Available globally. We only earn when you earn.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NexusMeme - AI Crypto Trading Bot',
    description: 'AI-powered crypto trading on Binance International. Available globally. Pay only on profits — $0 on losses.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://nexusmeme.com',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Do NOT set maximumScale — blocking pinch-zoom harms accessibility
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Mobile Web App Meta Tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="NexusMeme" />
        <meta name="theme-color" content="#1f2937" />

        {/* PWA Color Scheme */}
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="antialiased bg-white dark:bg-slate-950 text-slate-900 dark:text-white transition-colors">
        <AppInitializer />
        <PWARegister />
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
