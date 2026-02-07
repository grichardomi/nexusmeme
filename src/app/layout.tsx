import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { Header } from '@/components/layouts/Header';
import { AppInitializer } from '@/components/AppInitializer';
import './globals.css';

export const metadata: Metadata = {
  title: 'NexusMeme - AI Trading Bot Platform | 15% Performance Fees',
  description: 'AI-powered crypto trading bots focused on BTC & ETH. 15% performance fees on profits only — $0 on losses. No subscription fees.',
  keywords: 'trading bot, crypto trading, automated trading, AI trading strategies, performance fee model, algorithmic trading',
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
    locale: 'en_US',
    url: 'https://nexusmeme.com',
    siteName: 'NexusMeme',
    title: 'NexusMeme - Scale Your Trading Bot',
    description: 'AI-powered trading platform with 15% performance fees on profits. We only earn when you earn.',
    images: [
      {
        url: 'https://nexusmeme.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'NexusMeme Trading Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NexusMeme - AI Trading Bot Platform',
    description: 'AI-powered crypto trading focused on BTC & ETH. 15% on profits, $0 on losses.',
    images: ['https://nexusmeme.com/og-image.png'],
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
  maximumScale: 1,
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

        {/* Disable zoom on iOS for better app-like experience */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />

        {/* PWA Color Scheme */}
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="antialiased bg-white dark:bg-slate-950 text-slate-900 dark:text-white transition-colors">
        <AppInitializer />
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
