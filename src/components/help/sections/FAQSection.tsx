'use client';

import React from 'react';
import { CollapsibleQA } from '../CollapsibleQA';

interface FAQSectionProps {
  searchQuery: string;
}

export function FAQSection({ searchQuery }: FAQSectionProps) {
  const questions = [
    {
      question: 'What is the minimum capital required?',
      answer: `During your 10-day trial, you get $200 to test with. After the trial:\n\n- No minimum capital requirement\n- You can trade with any amount you choose\n- The more capital you have, the more you can potentially trade\n- It's recommended to start with capital you can afford to lose`,
    },
    {
      question: 'Can I run multiple bots?',
      answer: `No, each NexusMeme account is limited to 1 trading bot. This design:\n- Ensures focused risk management\n- Prevents over-leveraging your capital\n- Simplifies bot management\n\nIf you need multiple bots, you would need to create separate accounts.`,
    },
    {
      question: 'What are trading pairs and how many can I have?',
      answer: `Trading pairs are the cryptocurrencies your bot trades. For example:\n- BTC/USD: Bitcoin vs. US Dollar\n- ETH/USD: Ethereum vs. US Dollar\n- SOL/USD: Solana vs. US Dollar\n\nYour bot can trade up to 5 cryptocurrency pairs simultaneously. Example combinations:\n- BTC/USD + ETH/USD\n- BTC/USD + ETH/USD + SOL/USD + ADA/USD + XRP/USD\n\nYou choose which pairs your bot trades when creating it.`,
    },
    {
      question: 'How much profit can I expect?',
      answer: `Profits depend on many factors:\n- Market conditions (bullish, sideways, bearish)\n- Your trading capital\n- Risk tolerance\n- Trading pairs selected\n\nOur AI system:\n- Adapts to market conditions\n- Targets 2% gains in weak markets\n- Targets 5% gains in moderate trends\n- Targets 12% gains in strong trends\n\nExpected annual returns vary widely (5-50%+ depending on market). Past performance does not guarantee future results.`,
    },
    {
      question: 'What if I want to test before going live with my own capital?',
      answer: `Your 10-day live trading trial with $200 capital is your testing period:\n- You get to trade with real market conditions\n- Real orders execute and you see real P&L\n- This gives you confidence before trading with your own capital\n- You can monitor performance and see if the AI strategy works for you\n\nAfter your trial, you can continue with your own capital and only pay 5% on profits.`,
    },
    {
      question: 'Why did my trade lose money?',
      answer: `Trading always has risk. Losses happen when:\n- Price moves against your position quickly\n- Market volatility increases\n- Unexpected news affects prices\n- Stop loss is hit\n\nWays to manage losses:\n- Tighter stop loss settings\n- Smaller position sizes\n- More conservative risk settings\n- Diversifying across more pairs\n- Understanding the current market regime (uptrend vs. downtrend)`,
    },
    {
      question: 'How often does the AI update its strategy?',
      answer: `The AI system:\n- Analyzes market conditions continuously\n- Adjusts to current market regime (bullish, sideways, bearish)\n- Updates profit targets based on trend strength\n- Re-evaluates entry signals in real-time\n\nStrategy updates happen automatically without requiring manual intervention.`,
    },
    {
      question: 'What happens if I lose my API keys?',
      answer: `If you lose or suspect compromise of your exchange API keys:\n\n1. Immediately go to your exchange account\n2. Revoke the API credentials\n3. Create new API keys with the same permissions\n4. Update the keys in NexusMeme:\n   - Account > Connected Exchanges\n   - Select your exchange\n   - Paste new API keys\n   - Click "Update"\n\nYour bot will continue running with the new keys. The old keys become inactive.`,
    },
    {
      question: 'Is my account secure?',
      answer: `Security features include:\n- All data encrypted in transit (HTTPS)\n- API keys encrypted at rest\n- NexusMeme can only view balances and place trades\n- NexusMeme cannot withdraw funds from your account\n- Two-factor authentication (2FA) recommended\n- Regular security audits\n\nBest practices:\n- Enable 2FA on your exchange account\n- Use strong passwords\n- Never share your API secret key\n- Review connected apps regularly`,
    },
    {
      question: 'What exchanges does NexusMeme support?',
      answer: `We support three major exchanges:\n\n1. Kraken - Secure, US-based, great for USD trading\n2. Binance - Largest exchange, lowest fees, most pairs\n3. Coinbase - Beginner-friendly, high liquidity\n\nEach exchange has:\n- Different fee structures\n- Different available trading pairs\n- Different security features\n\nPick the exchange you're comfortable with.`,
    },
    {
      question: 'Can I export my trading data?',
      answer: `Yes! You can export your trading data anytime:\n\nTo export:\n1. Go to Dashboard > Select your bot > Trading History\n2. Click "Export"\n3. Choose date range\n4. Select format (CSV, JSON, or PDF)\n5. Download\n\nUseful for:\n- Tax reporting and accounting\n- Performance analysis\n- Sharing with financial advisors\n- Personal record keeping`,
    },
    {
      question: 'How is my data retained?',
      answer: `All your trading data is retained indefinitely:\n- Complete trade history is always available\n- All historical data is preserved\n- You can access data anytime\n\nBest practices:\n- Export your data regularly for backup\n- Keep local copies for tax records\n- Archive data annually for compliance`,
    },
    {
      question: 'What if I have technical issues?',
      answer: `For technical support:\n\n1. Check the Help Center (you're reading it!)\n2. Check your bot status:\n   - Go to Dashboard\n   - Look for status indicator (Running, Stopped, Error)\n   - Check bot logs for error messages\n3. Common issues:\n   - Bot stopped? Check exchange API connectivity\n   - No trades executing? Check trading pairs and capital\n   - High latency? Check your internet connection\n4. Contact support:\n   - Email: support@nexusmeme.com\n   - Include bot ID and error message\n   - Standard plan: Priority support response\n   - Pro plan: Dedicated support`,
    },
    {
      question: 'Can I get my money back?',
      answer: `Your capital and profits are always yours:\n\nTo withdraw your capital and profits:\n1. Stop your bot (optional)\n2. Wait for all trades to close\n3. Go to your exchange account directly\n4. Withdraw to your bank\n\nFees and considerations:\n- Exchange withdrawal fees (set by the exchange)\n- Bank transfer fees may apply\n- Currency conversion fees if applicable\n- Trading losses are your responsibility (you bear trading risk)\n- We only charge 5% on profitable trades`,
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
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Frequently Asked Questions</h2>
        <p className="text-slate-700 dark:text-slate-300">
          Common questions about NexusMeme features, plans, and trading.
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
