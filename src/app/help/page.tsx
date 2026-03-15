import { Metadata } from 'next';
import { HelpClient } from './HelpClient';

/**
 * Public Help Center Page
 * SEO-optimized with metadata and structured data
 * Accessible to all users (no authentication required)
 */

export const metadata: Metadata = {
  title: 'Help Center - NexusMeme | AI Trading Bot Platform with Performance-Based Fees',
  description:
    'Comprehensive help documentation for NexusMeme. Learn how to create trading bots, manage performance fees, connect exchanges, and start automated AI-powered crypto trading. Performance fee on profits only — $0 on losses.',
  keywords:
    'help, documentation, trading bot, crypto trading, FAQ, guides, support, performance fees, AI trading',
  alternates: {
    canonical: 'https://nexusmeme.com/help',
  },
  openGraph: {
    title: 'NexusMeme Help Center - Performance Fee Model',
    description: 'Learn how to use NexusMeme with performance-based pricing. We only earn when you earn.',
    url: 'https://nexusmeme.com/help',
    type: 'website',
    images: [
      {
        url: 'https://nexusmeme.com/og-image.png',
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NexusMeme Help - Performance Fee Trading Bot',
    description: 'Learn about performance-based fees, AI trading strategies, and bot management',
  },
};

// FAQ Schema Data for Search Engines
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is NexusMeme?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NexusMeme is an AI-powered trading bot platform that executes automated crypto trades on your behalf. It uses intelligent market regime detection to identify profitable trading opportunities and execute trades on Binance International or Kraken with customizable risk management.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does NexusMeme cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NexusMeme uses a simple performance-based pricing model. You pay a percentage of your profits only when your bot makes money. There are no setup fees, no subscription fees, and no charges if your bot loses money or breaks even. Billing happens monthly on the 1st.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a free trial?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes! Everyone gets a 10-day free trial with paper trading (simulated trades, zero risk). No payment required during the trial. You can switch to live trading during or after your trial — connect your exchange API keys (Binance International or Kraken) and go live whenever you\'re ready. Pay only a performance fee on profits.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need to pay upfront?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No! There are zero upfront costs. No setup fees, no credit card required. You get a 10-day free trial with paper trading. You only pay a performance fee on your profits after your trial ends.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which exchange does NexusMeme require?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NexusMeme supports two exchanges: Binance International (binance.com, available in 180+ countries, not US) and Kraken (kraken.com, available globally including US residents). Create an account on whichever exchange is available in your country, then connect it to NexusMeme via Settings → Exchange Connections.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the minimum capital required?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'During your 10-day trial and after, there are no capital limits. You trade with your own funds. No minimum capital requirement - trade with any amount you choose.',
      },
    },
    {
      '@type': 'Question',
      name: 'How many pairs can I trade?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Your bot trades BTC and ETH — the most established crypto markets. This focused approach ensures more consistent results.',
      },
    },
  ],
};


export default function HelpPage() {
  return (
    <>
      <HelpClient initialSection="getting-started" />
      {/* FAQ Schema Markup for Search Engines */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  );
}
