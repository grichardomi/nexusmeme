'use client';

import React from 'react';

interface BetaInfoProps {
  searchQuery?: string;
}

/**
 * Beta Information Section
 * Explains the beta program, features, and how to provide feedback
 */
export function BetaInfo({ searchQuery = '' }: BetaInfoProps) {
  const content = [
    {
      title: 'Welcome to NexusMeme Beta',
      icon: '🚀',
      description: 'You\'re using the beta version of NexusMeme, our AI-powered trading platform. This gives you early access to cutting-edge features while we continuously improve the platform.',
    },
    {
      title: 'What is Beta?',
      icon: '🧪',
      description: 'Beta means we\'re actively developing and testing new features. While the core trading functionality is stable and reliable, you may encounter occasional bugs or see features evolve based on user feedback.',
    },
    {
      title: 'Beta Features',
      icon: '✨',
      items: [
        'AI-powered market regime detection',
        'Dynamic profit targeting (ADX-based)',
        'Advanced risk management layers',
        'Real-time trade monitoring',
        'Performance fee billing system',
        'Multi-pair trading support',
        'Paper trading mode for testing',
      ],
    },
    {
      title: 'What to Expect',
      icon: '📋',
      items: [
        'Regular updates and improvements',
        'New features released frequently',
        'Occasional UI/UX refinements',
        'Performance optimizations',
        'Bug fixes and stability improvements',
      ],
    },
    {
      title: 'Your Feedback Matters',
      icon: '💬',
      description: 'As a beta user, your feedback helps shape the future of NexusMeme. Found a bug? Have a feature request? We want to hear from you!',
      items: [
        'Report bugs via support tickets',
        'Share feature requests',
        'Tell us about your trading experience',
        'Suggest UI/UX improvements',
      ],
    },
    {
      title: 'Beta User Benefits',
      icon: '🎁',
      items: [
        'Early access to new features',
        'Priority support during beta period',
        'Grandfathered pricing (current rates locked)',
        'Direct influence on product development',
        'Beta tester recognition',
      ],
    },
    {
      title: 'Stability & Safety',
      icon: '🛡️',
      description: 'Despite being in beta, we prioritize your trading safety:',
      items: [
        'Core trading engine is battle-tested',
        'Risk management systems are production-ready',
        'Paper trading mode for risk-free testing',
        'Regular backups and monitoring',
        'Emergency stop mechanisms in place',
      ],
    },
    {
      title: 'Roadmap Highlights',
      icon: '🗺️',
      description: 'Coming soon:',
      items: [
        'Additional exchange integrations',
        'Advanced portfolio analytics',
        'Custom strategy builder',
        'Mobile app (iOS & Android)',
        'Social trading features',
        'Enhanced AI models',
      ],
    },
  ];

  // Simple search filter
  const filteredContent = searchQuery
    ? content.filter(
        (section) =>
          section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          section.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          section.items?.some((item) =>
            item.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    : content;

  if (filteredContent.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">
          No results found for &quot;{searchQuery}&quot;
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8" id="beta">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl">🚀</span>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Beta Program</h2>
            <p className="text-purple-100 text-sm sm:text-base mt-1">
              You&apos;re an early adopter helping shape the future of AI trading
            </p>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="grid gap-6">
        {filteredContent.map((section, index) => (
          <div
            key={index}
            className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl flex-shrink-0">{section.icon}</span>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  {section.title}
                </h3>
                {section.description && (
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {section.description}
                  </p>
                )}
              </div>
            </div>

            {section.items && (
              <ul className="space-y-2 mt-4">
                {section.items.map((item, itemIndex) => (
                  <li
                    key={itemIndex}
                    className="flex items-start gap-2 text-slate-700 dark:text-slate-300"
                  >
                    <span className="text-green-500 mt-1 flex-shrink-0">✓</span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Contact Support */}
      <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-900/20 dark:via-purple-900/20 dark:to-pink-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-6 text-center">
        <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100 mb-2">
          Questions or Feedback?
        </h3>
        <p className="text-indigo-700 dark:text-indigo-300 mb-4">
          Join our community for instant help and real-time discussions!
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/psad3vBVmv'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Join Discord
          </a>
          <a
            href="mailto:support@nexusmeme.com"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-white dark:bg-slate-700 border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-600 transition"
          >
            📧 Email Support
          </a>
        </div>
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-3">
          💡 Discord = instant answers • Email = formal support
        </p>
      </div>
    </div>
  );
}
