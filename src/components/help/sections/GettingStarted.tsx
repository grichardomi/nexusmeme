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
      answer: `1. Sign up for a free account - you'll get a 10-day free trial
2. Verify your email address
3. Try paper trading (simulated) to test the bot risk-free
4. Connect your exchange API keys when ready for live trading
5. Configure your trading pairs and risk parameters
6. Upgrade to live trading after your trial to trade with real funds`,
    },
    {
      question: 'Do I need to pay upfront?',
      answer:
        'No! All new users get a 10-day free trial with paper trading (simulated trades, zero risk). No credit card required. After the trial, upgrade to live trading and pay only 15% on your profits.',
    },
    {
      question: 'Which exchanges are supported?',
      answer: 'NexusMeme supports major cryptocurrency exchanges. Connect your exchange account to start automated trading.',
    },
    {
      question: 'What are API keys and how do I get them?',
      answer: `API keys are credentials that allow NexusMeme to connect to your exchange account. Here's how to get them:
1. Log in to your exchange account
2. Go to Settings > API Management
3. Create new API credentials
4. Copy the public key and secret key
5. Paste them in NexusMeme Settings > Connected Exchanges
Note: Never share your secret key with anyone except NexusMeme.`,
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
        'During your 10-day trial, you use paper trading (simulated, no real money). After upgrading to live trading, there is no minimum capital requirement - you can trade with any amount you choose. The bot works with your own funds in your exchange account.',
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
