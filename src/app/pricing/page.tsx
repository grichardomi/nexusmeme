import type { Metadata } from 'next';
import { PricingClient } from './PricingClient';

export const metadata: Metadata = {
  title: 'Pricing - NexusMeme | Flat Fee + Performance Fee on Profits',
  description: 'Small monthly flat fee covers infrastructure. Performance fee only when your trading bot profits — $0 on losing months. Available worldwide on Binance International and Binance US.',
  keywords: 'crypto trading bot pricing, performance fee trading, flat fee trading bot, pay on profits crypto, Binance trading bot cost',
  openGraph: {
    title: 'NexusMeme Pricing — Flat Fee + Performance Fee on Profits',
    description: 'Small flat fee covers infrastructure. Performance fee only when your bot profits. $0 performance fee on losing months.',
    url: 'https://nexusmeme.com/pricing',
  },
  alternates: { canonical: 'https://nexusmeme.com/pricing' },
};

export default function PricingPage() {
  return <PricingClient />;
}
