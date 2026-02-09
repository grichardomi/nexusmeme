import { Metadata } from 'next';
import { HelpClient } from './HelpClient';

/**
 * Public Help Center Page
 * SEO-optimized with metadata and structured data
 * Accessible to all users (no authentication required)
 */

export const metadata: Metadata = {
  title: 'Help Center - NexusMeme | AI Trading Bot Platform with 15% Performance Fees',
  description:
    'Comprehensive help documentation for NexusMeme. Learn how to create trading bots, manage performance fees, connect exchanges, and start automated AI-powered crypto trading. 15% fee on profits only — $0 on losses.',
  keywords:
    'help, documentation, trading bot, crypto trading, FAQ, guides, support, performance fees, AI trading',
  alternates: {
    canonical: 'https://nexusmeme.com/help',
  },
  openGraph: {
    title: 'NexusMeme Help Center - Performance Fee Model',
    description: 'Learn how to use NexusMeme with 15% performance-based pricing. We only earn when you earn.',
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
    title: 'NexusMeme Help - 15% Performance Fee Trading Bot',
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
        text: 'NexusMeme is an AI-powered trading bot platform that executes automated crypto trades on your behalf. It uses intelligent market regime detection to identify profitable trading opportunities and execute trades on Binance with customizable risk management.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does NexusMeme cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NexusMeme uses a simple performance-based pricing model. You pay 15% of your profits only when your bot makes money. There are no setup fees, no subscription fees, and no charges if your bot loses money or breaks even. Billing happens monthly on the 1st.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a free trial?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes! Everyone gets a 10-day live trading trial with no capital limits. No payment required during the trial. After the trial, you pay only 15% on profits if you want to continue trading.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need to pay upfront?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No! There are zero upfront costs. No setup fees, no credit card required to get started. You get a 10-day live trading trial. You only pay 15% of your profits once your trial ends and you connect a payment method.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which exchange does NexusMeme require?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NexusMeme currently supports Binance as its primary exchange. Create a free Binance account at binance.com, then connect it to NexusMeme with an API key. More exchanges may be added in the future.',
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
