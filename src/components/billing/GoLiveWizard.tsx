'use client';

import { useState, useEffect } from 'react';
import { TRIAL_CONFIG } from '@/config/pricing';

type WizardStep = 'confirm' | 'processing' | 'success' | 'error';

interface BotInfo {
  id: string;
  name: string;
  isActive: boolean;
  tradingMode: 'paper' | 'live';
}

interface BotSwitchResult {
  botId: string;
  botName: string;
  success: boolean;
  error?: string;
}

interface GoLiveWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

  /**
   * Go Live Wizard
   * 2-click flow: Confirm → Done
   * Switches ALL user bots from paper to live trading
   * Handles: stop bot(s) → switch to live → restart bot(s) automatically
   * Requires fee acknowledgment checkbox before enabling switch
   */
export function GoLiveWizard({ onClose, onComplete }: GoLiveWizardProps) {
  const feePercentage = TRIAL_CONFIG.PERFORMANCE_FEE_PERCENT;

  const [step, setStep] = useState<WizardStep>('confirm');
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [feeAcknowledged, setFeeAcknowledged] = useState(false);
  const [switchResults, setSwitchResults] = useState<BotSwitchResult[]>([]);

  // ALWAYS fetch all bots to ensure ALL user bots switch to live
  useEffect(() => {
    fetchAllBots();
  }, []);

  const fetchAllBots = async () => {
    try {
      const res = await fetch('/api/bots');
      if (!res.ok) throw new Error('Failed to fetch bots');
      const data = await res.json();
      const allBots = data.bots || data;

      if (!allBots || allBots.length === 0) {
        setError('No bots found. Create a bot first before switching to live trading.');
        setStep('error');
        return;
      }

      // Filter to only paper trading bots
      const paperBots = allBots.filter((b: BotInfo) => b.tradingMode === 'paper');

      if (paperBots.length === 0) {
        setError('All your bots are already in live trading mode.');
        setStep('error');
        return;
      }

      setBots(paperBots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bots');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoLive = async () => {
    if (bots.length === 0) return;
    setStep('processing');
    setError(null);

    const results: BotSwitchResult[] = [];

    try {
      setProgressMessage(`Switching ${bots.length} bot${bots.length > 1 ? 's' : ''} to live trading...`);

      // Process each bot
      for (const bot of bots) {
        try {
          // Step 1: Stop bot if running
          if (bot.isActive) {
            const stopRes = await fetch('/api/bots', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ botId: bot.id, status: 'stopped' }),
            });
            if (!stopRes.ok) {
              const data = await stopRes.json();
              throw new Error(data.error || 'Failed to stop bot');
            }
            // Brief pause for clean shutdown
            await new Promise(r => setTimeout(r, 500));
          }

          // Step 2: Switch to live
          const switchRes = await fetch('/api/bots', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId: bot.id, tradingMode: 'live' }),
          });

          if (!switchRes.ok) {
            const data = await switchRes.json();
            if (data.code === 'PAYMENT_REQUIRED') {
              throw new Error('Your trial has expired. Please contact support to continue trading.');
            }
            throw new Error(data.error || 'Failed to switch to live');
          }

          // Step 3: Restart bot
          const startRes = await fetch('/api/bots', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId: bot.id, status: 'running' }),
          });

          if (!startRes.ok) {
            const data = await startRes.json();
            console.warn(`Bot ${bot.name} switched to live but failed to auto-start:`, data.error);
          }

          results.push({
            botId: bot.id,
            botName: bot.name,
            success: true,
          });
        } catch (botError) {
          results.push({
            botId: bot.id,
            botName: bot.name,
            success: false,
            error: botError instanceof Error ? botError.message : 'Unknown error',
          });
        }
      }

      setSwitchResults(results);

      // Check if any failed
      const failedCount = results.filter(r => !r.success).length;
      if (failedCount === results.length) {
        // All failed
        throw new Error(`Failed to switch ${failedCount} bot${failedCount > 1 ? 's' : ''} to live trading.`);
      } else if (failedCount > 0) {
        // Partial success
        setProgressMessage(`${results.length - failedCount}/${results.length} bots switched successfully`);
      }

      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStep('error');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6 sm:p-8 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-400">Loading bot info...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[95vh] sm:max-h-[90vh] flex flex-col">

        {/* Step: Confirm */}
        {step === 'confirm' && bots.length > 0 && (
          <>
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 sm:px-6 py-4 sm:py-5 flex-shrink-0">
              <h2 className="text-lg sm:text-xl font-bold">Switch to Live Trading</h2>
              <p className="text-green-100 text-xs sm:text-sm mt-1 truncate">
                {bots.length === 1 ? bots[0].name : `${bots.length} bots will be switched to live`}
              </p>
            </div>

            <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 sm:p-4">
                <p className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
                  ⚠️ This cannot be undone
                </p>
                <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
                  Once you switch to live, you cannot go back to paper trading. {bots.length === 1 ? 'Your bot' : 'All your bots'} will trade with <strong>real funds</strong>.
                </p>
              </div>

              {/* Show list of bots if more than 1 */}
              {bots.length > 1 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 max-h-32 overflow-y-auto">
                  <p className="text-xs sm:text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                    Bots to be switched ({bots.length}):
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    {bots.map((bot) => (
                      <li key={bot.id} className="truncate">• {bot.name} {bot.isActive && '(running)'}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <p className="font-medium text-slate-800 dark:text-slate-200">What happens next:</p>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">1.</span>
                  <p className="leading-relaxed">{bots.length === 1 ? 'Bot' : 'All bots'} will be stopped briefly if running</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">2.</span>
                  <p className="leading-relaxed">Trading mode switches from paper to live for {bots.length === 1 ? 'the bot' : 'all bots'}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">3.</span>
                  <p className="leading-relaxed">{bots.length === 1 ? 'Bot restarts' : 'Bots restart'} automatically in live mode</p>
                </div>
              </div>

              {/* Performance Fee Acknowledgment */}
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3">
                <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                  <p className="font-medium mb-1">Performance Fees</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {feePercentage}% on profitable trades only, billed monthly via crypto (BTC, ETH, USDC). No subscription fees.
                  </p>
                </div>

                <label className="flex items-start gap-2 sm:gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={feeAcknowledged}
                    onChange={(e) => setFeeAcknowledged(e.target.checked)}
                    className="mt-0.5 w-4 h-4 flex-shrink-0 rounded border-slate-300 dark:border-slate-600 text-green-600 focus:ring-green-500 cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    I acknowledge that a <strong>{feePercentage}% performance fee</strong> applies to all profitable trades.{' '}
                    <a
                      href="/legal/terms#performance-fees"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 dark:text-green-400 underline hover:text-green-700 dark:hover:text-green-300 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View terms
                    </a>
                  </span>
                </label>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition touch-manipulation"
              >
                Cancel
              </button>
              <button
                onClick={handleGoLive}
                disabled={!feeAcknowledged}
                className={`flex-1 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition touch-manipulation ${
                  feeAcknowledged
                    ? 'text-white bg-green-600 hover:bg-green-700'
                    : 'text-slate-400 bg-slate-200 dark:text-slate-500 dark:bg-slate-700 cursor-not-allowed'
                }`}
              >
                <span className="hidden sm:inline">Switch to Live Trading</span>
                <span className="sm:hidden">Go Live</span>
              </button>
            </div>
          </>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className="px-4 sm:px-6 py-8 sm:py-10 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
              {progressMessage}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2">
              Please wait, do not close this window.
            </p>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <>
            <div className="px-4 sm:px-6 py-8 sm:py-10 overflow-y-auto flex-1">
              <div className="text-4xl sm:text-5xl mb-4 text-center">🎉</div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-2 text-center">
                You&apos;re Live!
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm text-center mb-4 leading-relaxed px-2">
                {switchResults.length === 1 ? 'Your bot is' : 'Your bots are'} now trading with real funds. Profits will appear in your trading dashboard.
              </p>

              {/* Show results if multiple bots */}
              {switchResults.length > 1 && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 sm:p-4 mt-4 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Switch Results:
                  </p>
                  <ul className="text-xs space-y-1">
                    {switchResults.map((result) => (
                      <li key={result.botId} className={`${result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} truncate`}>
                        {result.success ? '✓' : '✗'} {result.botName} {result.error && `- ${result.error}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
              <button
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="w-full px-4 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition touch-manipulation"
              >
                Done
              </button>
            </div>
          </>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <>
            <div className="px-4 sm:px-6 py-6 sm:py-8 text-center overflow-y-auto flex-1">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-2">
                Something went wrong
              </h3>
              <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 leading-relaxed px-2">
                {error}
              </p>
            </div>

            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition touch-manipulation"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
