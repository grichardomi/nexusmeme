import { Metadata } from 'next';
import { HelpClient } from './HelpClient';

/**
 * Public Help Center Page
 * SEO-optimized with metadata and structured data
 * Accessible to all users (no authentication required)
 */

export const metadata: Metadata = {
  title: 'Help Center - NexusMeme | AI Trading Bot Platform with 5% Performance Fees',
  description:
    'Comprehensive help documentation for NexusMeme. Learn how to create trading bots, manage performance fees, connect exchanges, and start automated AI-powered crypto trading. 5% fee on profits only.',
  keywords:
    'help, documentation, trading bot, crypto trading, FAQ, guides, support, performance fees, AI trading',
  alternates: {
    canonical: 'https://nexusmeme.com/help',
  },
  openGraph: {
    title: 'NexusMeme Help Center - Performance Fee Model',
    description: 'Learn how to use NexusMeme with 5% performance-based pricing. Pay only when you profit.',
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
    title: 'NexusMeme Help - 5% Performance Fee Trading Bot',
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
        text: 'NexusMeme is an AI-powered trading bot platform that executes automated crypto trades on your behalf. It uses intelligent market regime detection to identify profitable trading opportunities and execute trades with customizable risk management across major exchanges.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does NexusMeme cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NexusMeme uses a simple performance-based pricing model. You pay 5% of your profits only when your bot makes money. There are no setup fees, no subscription fees, and no charges if your bot loses money or breaks even. Billing happens monthly on the 1st.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a free trial?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes! Everyone gets a 10-day live trading trial with $200 capital. No payment required during the trial. After the trial, you pay only 5% on profits if you want to continue trading.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need to pay upfront?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No! There are zero upfront costs. No setup fees, no credit card required to get started. You can test with your 10-day $200 trial. You only pay 5% of your profits once your trial ends and you connect a payment method.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which exchanges are supported?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NexusMeme supports major exchanges including Kraken, Binance, and Coinbase. You can choose any of these to connect your trading account.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the minimum capital required?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'During your 10-day trial, you get $200 to test with. After the trial, there is no minimum capital requirement - you can trade with any amount. The more capital you have, the more you can trade.',
      },
    },
    {
      '@type': 'Question',
      name: 'How many pairs can I trade?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Each bot can trade up to 5 cryptocurrency pairs simultaneously. You can configure which pairs your bot trades on when creating the bot. This allows diversification while maintaining focused risk management.',
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
