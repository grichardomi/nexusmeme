'use client';

import React, { useEffect, useState } from 'react';
import { CollapsibleQA } from '../CollapsibleQA';

interface GettingStartedProps {
  searchQuery: string;
}

export function GettingStarted({ searchQuery }: GettingStartedProps) {
  const [feePercent, setFeePercent] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/billing/fee-rate/default')
      .then(r => r.json())
      .then(d => setFeePercent(d.feePercent ?? null))
      .catch(() => {});
  }, []);
  const fee = feePercent !== null ? `${feePercent}%` : '…';

  const questions = [
    {
      question: 'What is NexusMeme?',
      answer:
        'NexusMeme is an AI-powered trading bot platform that executes automated crypto trades on your behalf. It uses intelligent market regime detection to identify profitable trading opportunities and execute trades across BTC and ETH with customizable risk management.',
    },
    {
      question: 'How do I get started?',
      answer: `1. Sign up for a free NexusMeme account — you'll get a 10-day free trial
2. Verify your email address
3. Create an account on your exchange:
   - **Binance International (binance.com)** — available in 180+ countries (not US)
   - **Kraken (kraken.com)** — available globally including US residents
4. Create your API key on your chosen exchange (see guides below)
5. Connect your API keys in Settings → Exchange Connections
6. Create your first bot — it starts in paper mode (simulated trades, zero risk)
7. Switch to live trading during or after your trial to trade with real capital ($1,000 USDT minimum)`,
    },
    {
      question: 'Do I need to pay upfront?',
      answer:
        `No! All new users get a 10-day free trial. Your bot starts in paper mode (simulated trades, zero risk) — no exchange account needed to try it out. Connect your API keys and switch to live trading whenever you're ready, during or after the trial. After the trial you pay only ${fee} on profits — nothing on losses.`,
    },
    {
      question: 'Which exchange do I need?',
      answer: `NexusMeme supports two exchanges:\n\n**Binance International (binance.com)**\n- Available in 180+ countries\n- Not available to US residents\n- Lower fees (0.10% per trade)\n- Highest global liquidity\n\n**Kraken (kraken.com)**\n- Available globally including US residents\n- Standard fees (0.26% per trade)\n- Fully regulated in the US\n\nBoth exchanges trade BTC/USDT and ETH/USDT. Connect whichever is available in your country in Settings → Exchange Connections.`,
    },
    {
      question: 'How do I get my Binance API key?',
      answer: `API keys allow NexusMeme to place trades on your Binance account. Here's how to create them:

1. Log in to your Binance account at binance.com
2. Hover over your profile icon (top right) and click "API Management"
3. Click "Create API" and select "System generated"
4. Enter a label (e.g., "NexusMeme Trading Bot")
5. Complete security verification (email + authenticator)
6. On the API key settings page, enable these permissions ONLY:
   - Enable Reading (required)
   - Enable Spot & Margin Trading (required)
   - Do NOT enable Withdrawals (keeps your funds safe)
7. Under "IP access restrictions", select "Unrestricted"
8. Copy your API Key and Secret Key immediately — the Secret Key is only shown once
9. In NexusMeme, go to Settings → Exchange Connections → Binance International
10. Paste your API Key and Secret Key and click "Connect"

IMPORTANT:
- Never enable "Enable Withdrawals" — NexusMeme never needs withdrawal access
- Save your Secret Key somewhere safe — Binance only shows it once`,
    },
    {
      question: 'How do I get my Kraken API key?',
      answer: `API keys allow NexusMeme to place trades on your Kraken account. Here's how to create them:

1. Log in to your Kraken account at kraken.com
2. Click your name (top right) and go to "Security" → "API"
3. Click "Create API Key"
4. Enter a label (e.g., "NexusMeme Trading Bot")
5. Under permissions, enable ONLY:
   - Query Funds (required)
   - Create & Modify Orders (required)
   - Do NOT enable Withdraw Funds
6. Click "Generate Key"
7. Copy your API Key and Private Key immediately — the Private Key is only shown once
8. In NexusMeme, go to Settings → Exchange Connections → Kraken
9. Paste your API Key and Private Key and click "Connect"

IMPORTANT:
- Never enable "Withdraw Funds" — NexusMeme never needs withdrawal access
- Save your Private Key somewhere safe — Kraken only shows it once`,
    },
    {
      question: 'Is my account secure?',
      answer:
        'Yes. Your API keys are encrypted and stored securely. NexusMeme can only view your account balance and execute trades - it cannot withdraw funds. Your keys are never shared with third parties.',
    },
    {
      question: 'What is the trial period?',
      answer:
        `Every new user gets a 10-day free trial with paper trading (simulated trades, zero risk). Test NexusMeme with real market data without risking real money. No payment required during the trial. After the trial ends, upgrade to live trading and pay only ${fee} on your profits.`,
    },
    {
      question: 'Can I trade with my own capital?',
      answer: `Yes! During your 10-day trial, you test the bot with paper trading (simulated). After the trial, upgrade to live trading to trade with your own real capital. You'll only pay ${fee} on your profits.`,
    },
    {
      question: 'What is the minimum capital required?',
      answer:
        'During your 10-day trial, you use paper trading (simulated, no real money required). For live trading, a minimum of $1,000 USDT/USD in your exchange account is required. This ensures your account can absorb normal market volatility and generate meaningful returns.',
    },
    {
      question: 'Can I create multiple bots?',
      answer:
        'Each account is limited to 1 trading bot. This ensures focused risk management and prevents over-leveraging. If you need more bots, consider creating separate accounts.',
    },
  ];

  const filtered = questions.filter(
    (q) =>
      searchQuery === '' ||
      q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Getting Started with NexusMeme</h2>
        <p className="text-slate-700 dark:text-slate-300">
          Start your automated trading journey in minutes. All new users get a 10-day free trial with paper trading (simulated, zero risk). Upgrade to live trading anytime.
        </p>
      </div>

      <div className="space-y-3">
        {filtered.length > 0 ? (
          filtered.map((qa, index) => <CollapsibleQA key={index} question={qa.question} answer={qa.answer} />)
        ) : (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">No results found for "{searchQuery}"</p>
        )}
      </div>
    </div>
  );
}
