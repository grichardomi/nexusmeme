'use client';


export type DateRange = '1w' | '1m' | '3m' | '1y' | 'custom';

export function getFromDate(dateRange: DateRange, customFrom: string): string | null {
  const now = new Date();
  if (dateRange === '1w') { now.setDate(now.getDate() - 7); return now.toISOString(); }
  if (dateRange === '1m') { now.setMonth(now.getMonth() - 1); return now.toISOString(); }
  if (dateRange === '3m') { now.setMonth(now.getMonth() - 3); return now.toISOString(); }
  if (dateRange === '1y') { now.setFullYear(now.getFullYear() - 1); return now.toISOString(); }
  if (dateRange === 'custom' && customFrom) return new Date(customFrom).toISOString();
  return null;
}

interface DateRangeTabsProps {
  value: DateRange;
  customFrom: string;
  customTo: string;
  onChange: (range: DateRange, from: string, to: string) => void;
}

const TABS: { key: DateRange; label: string }[] = [
  { key: '1w', label: '1 Week' },
  { key: '1m', label: '1 Month' },
  { key: '3m', label: '3 Months' },
  { key: '1y', label: '1 Year' },
  { key: 'custom', label: 'Custom' },
];

export function DateRangeTabs({ value, customFrom, customTo, onChange }: DateRangeTabsProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChange(key, customFrom, customTo)}
            className={`px-3 py-2.5 min-h-[44px] rounded text-xs font-medium whitespace-nowrap transition ${
              value === key
                ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">From</label>
          <input
            type="date"
            value={customFrom}
            onChange={e => onChange('custom', e.target.value, customTo)}
            className="text-xs px-2 py-2.5 min-h-[44px] rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
          <label className="text-xs text-slate-500 dark:text-slate-400">To</label>
          <input
            type="date"
            value={customTo}
            onChange={e => onChange('custom', customFrom, e.target.value)}
            className="text-xs px-2 py-2.5 min-h-[44px] rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>
      )}
    </div>
  );
}
