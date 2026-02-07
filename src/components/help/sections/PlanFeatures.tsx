'use client';

import React from 'react';
import Link from 'next/link';
import { CollapsibleQA } from '../CollapsibleQA';

interface PlanFeaturesProps {
  searchQuery: string;
}

export function PlanFeatures({ searchQuery }: PlanFeaturesProps) {
  const questions = [
    {
      question: 'How does the performance fee model work?',
      answer: `NexusMeme uses a simple performance-based pricing model:\n\n✓ 15% fee on profits only\n✓ Charged monthly (every 1st at 2 AM UTC)\n✓ No subscription fees\n✓ No setup costs\n✓ FREE if your bot loses money\n✓ Focused on BTC & ETH — highest liquidity\n\nExample:\n- Your bot makes $1,000 profit → You pay $150 (15% fee)\n- Your bot loses $500 → You pay $0 (no fee)\n- Your bot breaks even → You pay $0 (no fee)\n\nNo hidden charges, completely transparent billing. We only earn when you earn.`,
    },
    {
      question: 'Do I need to pay upfront?',
      answer: `No! There are zero upfront costs:\n\n✓ No setup fee\n✓ No trial period fee\n✓ No subscription fee\n✓ No credit card required to get started\n\nYou only pay 15% of your profits once your bot starts making money. If your bot never makes a profit, you never pay anything.\n\nLearn more: Check your dashboard under Billing & Subscription to see detailed fee calculations and billing history.`,
    },
    {
      question: 'How is my fee calculated?',
      answer: `Fees are calculated monthly based on your bot's profitable trades:\n\n1. NexusMeme tracks all profitable trades\n2. Total profit is calculated for the month\n3. Fee = Total profit × 15%\n4. Fee is billed on the 1st of the next month\n\nExample billing:\n- Month 1: $2,000 profit → Fee = $300\n- Month 2: -$500 loss → Fee = $0 (no charge)\n- Month 3: $3,000 profit → Fee = $450\n\nYou can see the exact calculation in your Billing Dashboard under "Performance Fees Summary".`,
    },
    {
      question: 'What payment methods do you accept?',
      answer: `We accept all major payment methods:\n\n✓ Credit cards (Visa, Mastercard, American Express, Discover)\n✓ Debit cards\n✓ Digital wallets (Apple Pay, Google Pay)\n\nAll payments are processed securely through Stripe. Your payment information is encrypted and never stored on our servers.`,
    },
    {
      question: 'Can I cancel anytime?',
      answer: `Yes! You can cancel anytime without penalties:\n\n1. Go to Dashboard > Billing & Subscription\n2. Click "Manage Payment Method" or "Cancel Subscription"\n3. Confirm cancellation\n\nYou won't be charged again after cancellation. Any pending fees from the current month will still apply. No cancellation fees or penalties.`,
    },
    {
      question: 'Can I view my fees and billing history?',
      answer: `Yes! Your Billing Dashboard shows everything:\n\n✓ Real-time fee summary\n✓ Recent transactions with fee amounts\n✓ Monthly charge history\n✓ Billing status and payment methods\n✓ Download invoices and receipts\n\nVisit Dashboard > Billing & Subscription to see all details.`,
    },
    {
      question: 'What if a payment fails?',
      answer: `If a payment fails:\n\n1. You'll receive an email notification\n2. We'll retry payment automatically 3 times over 7 days\n3. You can update your payment method in the Billing Dashboard\n4. Your bot will continue trading during this period\n\nIf payment ultimately fails after retries, your bot may be suspended temporarily until payment is resolved. Update your payment method immediately to restore trading.`,
    },
    {
      question: 'Is there a money-back guarantee?',
      answer: `No refunds for trading losses. However:\n\n✓ You ONLY pay if your bot makes money\n✓ Fees are calculated based on actual profits\n✓ You can cancel anytime\n✓ No subscription lock-in\n\nOur performance fee model is aligned with your success. We make money only when you make money.`,
    },
    {
      question: 'How do I dispute a fee?',
      answer: `If you believe a fee is incorrect:\n\n1. Go to Dashboard > Support > Create Ticket\n2. Explain the issue with the fee\n3. Our support team will review within 24 hours\n4. We can adjust or waive fees if there's an error\n\nContact us immediately at support@nexusmeme.com if you notice any billing discrepancies.`,
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
          Simple, transparent pricing. You only pay 15% of your profits. No subscription fees, no setup costs. We only earn when you earn.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded p-3 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">15%</div>
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
            <span>Create your trading bot and connect your exchange account</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 dark:text-blue-400 min-w-fit">Step 2:</span>
            <span>Your bot starts trading and making profits</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 dark:text-blue-400 min-w-fit">Step 3:</span>
            <span>Monthly fee is calculated on the 1st: Your profit × 15%</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 dark:text-blue-400 min-w-fit">Step 4:</span>
            <span>We charge your payment method for the fee</span>
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
