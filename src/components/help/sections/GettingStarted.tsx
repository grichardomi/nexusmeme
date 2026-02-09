'use client';

import React from 'react';
import { CollapsibleQA } from '../CollapsibleQA';

interface GettingStartedProps {
  searchQuery: string;
}

export function GettingStarted({ searchQuery }: GettingStartedProps) {
  const questions = [
    {
      question: 'What is NexusMeme?',
      answer:
        'NexusMeme is an AI-powered trading bot platform that executes automated crypto trades on your behalf. It uses intelligent market regime detection to identify profitable trading opportunities and execute trades across BTC and ETH with customizable risk management.',
    },
    {
      question: 'How do I get started?',
      answer: `1. Create a Binance account at binance.com (if you don't have one)
2. Sign up for a free NexusMeme account — you'll get a 10-day free trial
3. Verify your email address
4. Try paper trading (simulated) to test the bot risk-free
5. Create your Binance API key (see "How do I get my Binance API key?" below)
6. Connect your Binance API keys in NexusMeme
7. Configure your trading pairs and risk parameters
8. Upgrade to live trading after your trial to trade with real funds`,
    },
    {
      question: 'Do I need to pay upfront?',
      answer:
        'No! All new users get a 10-day free trial with paper trading (simulated trades, zero risk). No credit card required. After the trial, upgrade to live trading and pay only 15% on your profits.',
    },
    {
      question: 'Which exchange do I need?',
      answer: `NexusMeme currently supports Binance as its primary exchange. You'll need a Binance account to start live trading.

You'll need a verified Binance account with spot trading enabled. Sign up at binance.com if you don't have one yet.

More exchanges may be added in the future.`,
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
7. Under "IP access restrictions", select "Unrestricted" (or add NexusMeme's server IP if provided)
8. Copy your API Key and Secret Key immediately — the Secret Key is only shown once
9. In NexusMeme, go to Account > Connected Exchanges
10. Paste your API Key and Secret Key and click "Connect"

IMPORTANT:
- Never enable "Enable Withdrawals" — NexusMeme never needs withdrawal access
- Save your Secret Key somewhere safe — Binance only shows it once
- You can delete or disable the API key from Binance anytime to revoke access`,
    },
    {
      question: 'Is my account secure?',
      answer:
        'Yes. Your API keys are encrypted and stored securely. NexusMeme can only view your account balance and execute trades - it cannot withdraw funds. Your keys are never shared with third parties.',
    },
    {
      question: 'What is the trial period?',
      answer:
        'Every new user gets a 10-day free trial with paper trading (simulated trades, zero risk). This lets you test NexusMeme with real market data without risking real money. No payment required during the trial. After the trial ends, upgrade to live trading and pay only 15% on your profits.',
    },
    {
      question: 'Can I trade with my own capital?',
      answer: `Yes! During your 10-day trial, you test the bot with paper trading (simulated). After the trial, upgrade to live trading to trade with your own real capital. You'll only pay 15% on your profits. There is no minimum capital requirement - you can trade with any amount you choose.`,
    },
    {
      question: 'What is the minimum capital required?',
      answer:
        'During your 10-day trial, you use paper trading (simulated, no real money). After upgrading to live trading, there is no minimum capital requirement - you can trade with any amount you choose. The bot works with your own funds in your Binance account.',
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
