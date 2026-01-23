'use client';

import React from 'react';

interface SearchHelpProps {
  onSearch: (query: string) => void;
  query: string;
}

export function SearchHelp({ onSearch, query }: SearchHelpProps) {
  const handleSearch = (value: string) => {
    onSearch(value);
  };

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search help topics... (e.g., 'create bot', 'plans', 'pairs')"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-full px-6 py-3 pl-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span className="absolute left-4 top-3.5 text-slate-400">🔍</span>
    </div>
  );
}
