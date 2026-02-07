'use client';

import React from 'react';
import { CollapsibleQA } from '../CollapsibleQA';

interface HowToGuidesProps {
  searchQuery: string;
}

export function HowToGuides({ searchQuery }: HowToGuidesProps) {
  const questions = [
    {
      question: 'How do I create my first trading bot?',
      answer: `Step-by-step guide to create your first bot:\n\n1. Log in to your NexusMeme account\n2. Go to Dashboard > Create New Bot\n3. Name your bot (e.g., "BTC/ETH Trader")\n4. Select your trading pairs (BTC & ETH — the most liquid, profitable markets)\n5. Set your trading capital\n6. Choose trading mode:\n   - Paper Trading: Test without real money (recommended first)\n   - Live Trading: Real trades with real capital\n7. Configure AI strategy settings\n8. Review settings and click "Create Bot"\n\nYour bot is now ready to start trading!`,
    },
    {
      question: 'How do I add or change trading pairs?',
      answer: `To add or modify trading pairs on your bot:\n\n1. Go to Dashboard and select your bot\n2. Click "Edit Trading Pairs"\n3. Select from BTC and ETH pairs (e.g., BTC/USD, ETH/USD)\n4. Click "Save Changes"\n5. Changes take effect immediately\n\nNexusMeme is focused on BTC & ETH — the most liquid, profitable crypto markets. This disciplined approach ensures tighter spreads and more consistent results.\n\nNote: Paper trading bots can be modified anytime. Live trading bots may have brief interruptions when updating pairs.`,
    },
    {
      question: 'How do I connect my exchange account?',
      answer: `Here's how to connect your exchange account:\n\n1. Log in to your exchange account\n2. Go to Settings > API Management\n3. Create new API credentials with these permissions:\n   - View account balance\n   - Place orders\n   - Cancel orders\n4. Copy the API Key and Secret Key\n5. In NexusMeme, go to Account > Connected Exchanges\n6. Select your exchange\n7. Paste your API Key and Secret Key\n8. Click "Connect Exchange"\n9. You'll see a confirmation when successful\n\nIMPORTANT: Never share your Secret Key with anyone except NexusMeme. You can revoke API access anytime from your exchange.`,
    },
    {
      question: 'How do I switch from paper trading to live trading?',
      answer: `Ready to trade with real money? Here's how:\n\n1. Go to Dashboard and select your bot\n2. Click "Bot Settings"\n3. Find "Trading Mode" section\n4. Click "Switch to Live Trading"\n5. Review the risks and confirm\n6. Enter your capital amount\n7. Click "Confirm"\n\nWARNING: This cannot be undone. Once live trading starts:\n- Your capital will be at risk\n- Trades will execute with real money\n- Losses are real\n- Make sure you've tested thoroughly in paper mode first\n\nBest practices:\n- Start with a small amount\n- Test your strategy in paper mode for at least a few days\n- Only use capital you can afford to lose`,
    },
    {
      question: 'How do I stop a bot?',
      answer: `You have two options for stopping your bot:\n\n**OPTION 1: Pause Trading (Recommended for most cases)**\n1. Go to Dashboard and select your bot\n2. Click the "⏸️ Pause Trading" button\n3. Your bot will stop opening new trades\n4. Existing open positions remain open and close naturally:\n   - Stop losses will still trigger\n   - Take profit targets will still close positions\n   - Exit signals will still work\n5. You can restart the bot anytime\n\n**OPTION 2: Close All & Pause (For immediate risk reduction)**\n1. Go to Dashboard and select your bot\n2. Click the "⏹️ Close All & Pause" button\n3. All open positions close immediately at current market prices\n4. Bot then pauses\n5. Ideal for: End of day, market volatility, or quick exits\n\n**To completely delete a bot:**\n1. Click "🗑️ Delete Bot" button\n2. Confirm deletion (this is permanent!)\n3. All trade history and settings are deleted`,
    },
    {
      question: 'How do I view my trading history?',
      answer: `To see all trades executed by your bot:\n\n1. Go to Dashboard and select your bot\n2. Click "Trading History"\n3. You'll see:\n   - Entry price and time\n   - Exit price and time\n   - Profit/loss\n   - Trading pair\n4. Filter by date or pair\n5. Export history anytime\n\nAll trading data is retained indefinitely — complete history always available.`,
    },
    {
      question: 'How do I adjust risk settings?',
      answer: `To modify your bot's risk parameters:\n\n1. Go to Dashboard and select your bot\n2. Click "Risk Settings"\n3. Adjust these parameters:\n   - Maximum loss per trade: The maximum you're willing to lose per trade\n   - Stop loss percentage: Automatic exit if trade goes against you\n   - Take profit targets: Different targets based on market conditions\n   - Max concurrent trades: How many trades can run at the same time\n4. Save changes\n\nIMPORTANT:\n- Tighter risk settings = less profit but less risk\n- Looser risk settings = more profit but more risk\n- Default settings are optimized for safety\n- Don't change these unless you understand the implications`,
    },
    {
      question: 'How do I see performance analytics?',
      answer: `View your bot's performance metrics:\n\n1. Go to Dashboard and select your bot\n2. Click "Analytics"\n3. View key metrics:\n   - Total return: Overall profit/loss percentage\n   - Win rate: Percentage of profitable trades\n   - Profit factor: Ratio of gains to losses\n   - Maximum drawdown: Largest peak-to-trough decline\n   - Sharpe ratio: Risk-adjusted returns\n4. Filter by time period (1 week, 1 month, 3 months, etc.)\n5. Export reports (Standard and Pro plans)\n\nAnalytics update in real-time as trades execute.`,
    },
    {
      question: 'How do I manage my plan?',
      answer: `NexusMeme uses a simple performance fee model — no plan tiers to manage:\n\n1. Go to Account > Billing & Plans\n2. View your current fee status and billing history\n3. Manage your payment method\n\nEveryone gets the same features:\n- 1 AI trading bot\n- BTC & ETH trading\n- All exchanges supported\n- Full analytics and trade history\n- 15% on profits only — $0 on losses`,
    },
    {
      question: 'How do I enable trade alerts?',
      answer: `Get notifications when your bot trades:\n\n1. Go to Account > Notifications\n2. Under "Trade Alerts", toggle "Enable"\n3. Choose notification methods:\n   - Email\n   - In-app notifications\n4. Select when to notify:\n   - On every trade\n   - On profitable trades only\n   - On large trades only\n5. Save preferences\n\nYou'll now receive alerts when:\n- A trade is opened\n- A position is closed\n- A stop loss is hit\n- An error occurs`,
    },
    {
      question: 'How do I stop paying fees?',
      answer: `Since NexusMeme uses performance fees (not subscriptions), you stop paying by stopping trading:\n\n1. Go to Dashboard and pause or delete your bot\n2. No more trades = no more fees\n3. Any pending fees from past profits will still be billed on the 1st\n\nThere are no cancellation fees or penalties. You only ever pay for profits your bot already earned. To start again, just create a new bot.`,
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
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">How-To Guides</h2>
        <p className="text-slate-700 dark:text-slate-300">
          Step-by-step instructions for common tasks and features.
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
