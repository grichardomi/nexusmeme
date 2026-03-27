'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ScoreComponent {
  label: string;
  score: number;
  max: number;
  status: 'good' | 'warn' | 'bad';
  detail: string;
}

interface HealthData {
  score: number;
  components: ScoreComponent[];
}

function scoreGrade(score: number): { label: string; color: string; ring: string; bg: string } {
  if (score >= 85) return { label: 'Excellent', color: 'text-green-600 dark:text-green-400', ring: 'stroke-green-500', bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' };
  if (score >= 65) return { label: 'Good',      color: 'text-blue-600 dark:text-blue-400',  ring: 'stroke-blue-500',  bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' };
  if (score >= 45) return { label: 'Fair',       color: 'text-yellow-600 dark:text-yellow-400', ring: 'stroke-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' };
  return           { label: 'Needs Attention', color: 'text-red-600 dark:text-red-400',   ring: 'stroke-red-500',   bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' };
}

function statusIcon(status: 'good' | 'warn' | 'bad') {
  if (status === 'good') return <span className="text-green-500">✓</span>;
  if (status === 'warn') return <span className="text-yellow-500">⚠</span>;
  return <span className="text-red-500">✗</span>;
}

function ScoreRing({ score }: { score: number }) {
  const grade = scoreGrade(score);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;

  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        {/* Track */}
        <circle cx="48" cy="48" r={r} fill="none" strokeWidth="8" className="stroke-slate-200 dark:stroke-slate-700" />
        {/* Fill */}
        <circle
          cx="48" cy="48" r={r} fill="none" strokeWidth="8"
          className={`${grade.ring} transition-all duration-700`}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-2xl font-bold leading-none ${grade.color}`}>{score}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

export function BotHealthScore() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch('/api/bots/health-score');
        if (!res.ok) return;
        setData(await res.json());
      } finally {
        setLoading(false);
      }
    }
    fetch_();
    const interval = setInterval(fetch_, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 animate-pulse">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-4" />
        <div className="flex gap-4">
          <div className="w-24 h-24 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1 space-y-2 pt-2">
            {[1,2,3,4].map(i => <div key={i} className="h-3 bg-slate-200 dark:bg-slate-700 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <p className="text-xs text-slate-500 dark:text-slate-400">Health score unavailable</p>
    </div>
  );

  const grade = scoreGrade(data.score);
  const badItems = data.components.filter(c => c.status !== 'good');

  return (
    <div className={`rounded-xl border p-5 ${grade.bg}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Bot Health Score</h3>
        <span className={`text-xs font-semibold ${grade.color}`}>{grade.label}</span>
      </div>

      {/* Score ring + breakdown side by side on sm+, stacked on mobile */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {/* Ring */}
        <div className="flex sm:flex-col items-center gap-3 sm:gap-1">
          <ScoreRing score={data.score} />
        </div>

        {/* Component breakdown */}
        <div className="flex-1 space-y-2 w-full">
          {data.components.map((c) => (
            <div key={c.label} className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">{statusIcon(c.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{c.label}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{c.score}/{c.max}</span>
                </div>
                {/* Progress bar */}
                <div className="mt-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      c.status === 'good' ? 'bg-green-500' : c.status === 'warn' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${(c.score / c.max) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action hints for non-good items */}
      {badItems.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-1">
          {badItems.map(c => (
            <div key={c.label} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="shrink-0">→</span>
              <span>
                {c.label === 'Bot & API Keys' && !c.detail.includes('running') && (
                  <Link href="/dashboard/settings" className="underline text-blue-600 dark:text-blue-400">Connect API keys</Link>
                )}
                {c.label === 'Billing' && (
                  <Link href="/dashboard/billing" className="underline text-blue-600 dark:text-blue-400">Pay invoice</Link>
                )}
                {c.label === 'Win Rate' && c.status === 'bad' && 'Win rate below target — market conditions may be unfavourable'}
                {c.label === 'Activity' && c.status === 'bad' && (
                  <Link href={`/dashboard/bots`} className="underline text-blue-600 dark:text-blue-400">Start your bot</Link>
                )}
                {/* Fallback for warn states */}
                {c.status === 'warn' && !['Billing','Activity','Bot & API Keys'].includes(c.label) && c.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
