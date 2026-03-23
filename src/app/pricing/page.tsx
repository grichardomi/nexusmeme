import type { Metadata } from 'next';
import { PricingClient } from './PricingClient';

export const metadata: Metadata = {
  title: 'Pricing - NexusMeme | Pay Only on Profits',
  description: 'No monthly fees. No subscriptions. NexusMeme charges a performance fee only when your trading bot profits. Pay nothing when it loses. Available worldwide on Binance International and Binance US.',
  keywords: 'crypto trading bot pricing, performance fee trading, no subscription trading bot, pay on profits crypto, Binance trading bot cost',
  openGraph: {
    title: 'NexusMeme Pricing — Pay Only on Profits',
    description: 'No monthly fees. Performance fee only when your bot profits. Available worldwide via Binance International and Binance US.',
    url: 'https://nexusmeme.com/pricing',
  },
  alternates: { canonical: 'https://nexusmeme.com/pricing' },
};

export default function PricingPage() {
  return <PricingClient />;
}
