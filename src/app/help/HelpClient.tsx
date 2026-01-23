'use client';

import React from 'react';
import { SearchHelp } from '@/components/help/SearchHelp';
import { GettingStarted } from '@/components/help/sections/GettingStarted';
import { PlanFeatures } from '@/components/help/sections/PlanFeatures';
import { HowToGuides } from '@/components/help/sections/HowToGuides';
import { FAQSection } from '@/components/help/sections/FAQSection';

interface HelpClientProps {
  initialSection: string;
}

/**
 * Client-side component for help page interactivity
 * Manages search and section navigation using hooks
 */
export function HelpClient({ initialSection }: HelpClientProps) {
  const [activeSection, setActiveSection] = React.useState<
    'getting-started' | 'pricing' | 'how-to' | 'faq'
  >(initialSection as 'getting-started' | 'pricing' | 'how-to' | 'faq');
  const [searchQuery, setSearchQuery] = React.useState('');

  const sections = [
    { id: 'getting-started', label: 'Getting Started', icon: '🚀' },
    { id: 'pricing', label: 'Performance Fees', icon: '💳' },
    { id: 'how-to', label: 'How-To Guides', icon: '📖' },
    { id: 'faq', label: 'FAQ', icon: '❓' },
  ] as const;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-900 dark:to-blue-800 text-white py-8 px-4 sm:px-6 lg:px-8 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Help Center</h1>
          <p className="text-blue-100">Everything you need to know about NexusMeme</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Search Bar */}
        <div className="mb-12">
          <SearchHelp onSearch={setSearchQuery} query={searchQuery} />
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-12 border-b border-slate-200 dark:border-slate-800">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => {
                setActiveSection(section.id);
                setSearchQuery('');
              }}
              className={`px-6 py-4 font-medium transition whitespace-nowrap ${
                activeSection === section.id
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="mr-2">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </div>

        {/* Content Sections */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-8 min-h-screen">
          {activeSection === 'getting-started' && (
            <GettingStarted searchQuery={searchQuery} />
          )}
          {activeSection === 'pricing' && (
            <PlanFeatures searchQuery={searchQuery} />
          )}
          {activeSection === 'how-to' && (
            <HowToGuides searchQuery={searchQuery} />
          )}
          {activeSection === 'faq' && <FAQSection searchQuery={searchQuery} />}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-100 dark:bg-slate-800 mt-12 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center text-slate-600 dark:text-slate-400">
          <p>
            Still need help? Email us at{' '}
            <a
              href="mailto:support@nexusmeme.com"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              support@nexusmeme.com
            </a>
          </p>
          <p className="text-sm mt-2">Available 24/7 for all users</p>
        </div>
      </div>
    </div>
  );
}
