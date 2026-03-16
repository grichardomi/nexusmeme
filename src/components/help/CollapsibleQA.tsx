'use client';

import React, { useState } from 'react';

interface CollapsibleQAProps {
  question: string;
  answer: string;
}

export function CollapsibleQA({ question, answer }: CollapsibleQAProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Format answer with line breaks and numbered lists
  const formatAnswer = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, index) => {
      if (line.match(/^\d+\./)) {
        return (
          <div key={index} className="ml-4 mt-2">
            {line}
          </div>
        );
      }
      return (
        <div key={index} className="mt-2">
          {line}
        </div>
      );
    });
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 sm:px-6 py-3 sm:py-4 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition"
      >
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white flex-1 pr-2">{question}</h3>
        <svg className={`w-5 h-5 flex-shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {isOpen && (
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm sm:text-base whitespace-pre-wrap">
          {formatAnswer(answer)}
        </div>
      )}
    </div>
  );
}
