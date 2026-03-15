'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CollapsibleQA } from '../CollapsibleQA';

interface PlanFeaturesProps {
  searchQuery: string;
}

export function PlanFeatures({ searchQuery }: PlanFeaturesProps) {
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
      question: 'How does the performance fee model work?',
      answer: `NexusMeme uses a simple performance-based pricing model:\n\n✓ ${fee} fee on profits only\n✓ Charged monthly (every 1st at 2 AM UTC)\n✓ No subscription fees\n✓ No setup costs\n✓ FREE if your bot loses money\n✓ Focused on BTC & ETH\n✓ Minimum $1,000 account balance for live trading\n\nNo hidden charges, completely transparent billing. We only earn when you earn.`,
    },
    {
      question: 'Do I need to pay upfront?',
      answer: `No! There are zero upfront costs:\n\n✓ No setup fee\n✓ No trial period fee\n✓ No subscription fee\n✓ No credit card required\n\nYou only pay ${fee} of your profits once your bot starts making money. If your bot never makes a profit, you never pay anything.`,
    },
    {
      question: 'How is my fee calculated?',
      answer: `Fees are calculated monthly based on your bot's profitable trades:\n\n1. NexusMeme tracks all profitable trades\n2. Total profit is calculated for the month\n3. Fee = Total profit × ${fee}\n4. Fee is billed on the 1st of the next month\n\nYou can see the exact calculation in your Billing Dashboard under "Performance Fees Summary".`,
    },
    {
      question: 'What payment methods do you accept?',
      answer: `Performance fees are paid with USDC on Base:\n\n✓ MetaMask (one-click pay)\n✓ Any WalletConnect wallet\n✓ Manual transfer (scan QR code)\n\nPayment confirms automatically within seconds. No credit cards, no banks, no processor fees.`,
    },
    {
      question: 'Can I cancel anytime?',
      answer: `Yes — stop or delete your bot at any time.\n\nYou only owe fees for profits already made. No cancellation fees, no lock-in.`,
    },
    {
      question: 'Can I view my fees and billing history?',
      answer: `Yes! Your Billing Dashboard shows everything:\n\n✓ Real-time fee summary\n✓ Recent transactions with fee amounts\n✓ Monthly charge history\n✓ USDC invoice status\n\nVisit Dashboard → Billing & Plans to see all details.`,
    },
    {
      question: 'What if a payment is late?',
      answer: `If an invoice is unpaid:\n\n1. You'll receive an email notification\n2. Your bot continues trading during the grace period\n3. After the grace period, your bot is paused until the invoice is paid\n4. Pay the USDC invoice in Billing & Plans to immediately resume trading`,
    },
    {
      question: 'Is there a money-back guarantee?',
      answer: `No refunds for trading losses — you only pay fees on profits, so there are no losses to refund.\n\n✓ You ONLY pay if your bot makes money\n✓ Fees are based on actual profits\n✓ Cancel anytime with no penalty`,
    },
    {
      question: 'How do I dispute a fee?',
      answer: `If you believe a fee is incorrect:\n\n1. Go to Dashboard → Support → Create Ticket\n2. Explain the issue\n3. Our team will review within 24 hours\n4. We can adjust or waive fees if there's an error`,
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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">💳 Performance Fee Model</h2>
        <p className="text-slate-700 dark:text-slate-300 mb-4">
          Simple, transparent pricing. You only pay {fee} of your profits. No subscription fees, no setup costs. We only earn when you earn.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded p-3 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{fee}</div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Fee on Profits</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded p-3 text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">$0</div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Setup Cost</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded p-3 text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">1</div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Bot Per Account</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded p-3 text-center">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">FREE</div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">If Bot Loses</div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">How It Works</h3>
        <ol className="space-y-3 text-slate-700 dark:text-slate-300">
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 dark:text-blue-400 min-w-fit">Step 1:</span>
            <span>Create your trading bot and connect your Binance account</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 dark:text-blue-400 min-w-fit">Step 2:</span>
            <span>Your bot starts trading and making profits</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 dark:text-blue-400 min-w-fit">Step 3:</span>
            <span>Monthly fee is calculated on the 1st: Your profit × {fee}</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 dark:text-blue-400 min-w-fit">Step 4:</span>
            <span>Pay your USDC invoice directly from Billing & Plans</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 dark:text-blue-400 min-w-fit">Step 5:</span>
            <span>View your detailed billing history in the dashboard</span>
          </li>
        </ol>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link
          href="/dashboard/billing"
          className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg p-4 transition"
        >
          <h4 className="font-semibold text-slate-900 dark:text-white mb-1">View Your Billing</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400">Check fees and payment history →</p>
        </Link>
        <Link
          href="/help/performance-fees"
          className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg p-4 transition"
        >
          <h4 className="font-semibold text-slate-900 dark:text-white mb-1">Detailed Guide</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400">Learn more about performance fees →</p>
        </Link>
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
