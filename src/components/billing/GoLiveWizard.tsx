'use client';

import { useState, useEffect } from 'react';

type WizardStep = 'confirm' | 'processing' | 'success' | 'error';

interface BotInfo {
  id: string;
  name: string;
  isActive: boolean;
  tradingMode: 'paper' | 'live';
  exchange: string;
}

interface BotSwitchResult {
  botId: string;
  botName: string;
  success: boolean;
  error?: string;
}

interface BalanceInfo {
  real: number;         // raw USDT/stablecoin balance
  minimum: number;      // LIVE_TRADING_MIN_BALANCE_USD (total account value threshold)
  minUsdt: number;      // LIVE_TRADING_MIN_USDT_USD (min stablecoin to place first trade)
  totalAccountValue?: number; // all assets converted to USD
  sufficient: boolean;
  exchange: string;
  error?: string;       // set if balance fetch failed (non-blocking)
}

interface GoLiveWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

/**
 * Go Live Wizard
 * Switches ALL user bots from paper to live trading.
 * Pre-checks:
 *   1. Fetches dynamic fee from /api/billing/fee-rate/default (no hardcoded %)
 *   2. Fetches exchange balance via /api/bots/[id]/balance and shows it on
 *      the confirm screen so the user knows their balance before switching
 * Requires fee acknowledgment checkbox before enabling switch.
 */
export function GoLiveWizard({ onClose, onComplete }: GoLiveWizardProps) {
  const [step, setStep] = useState<WizardStep>('confirm');
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [feeAcknowledged, setFeeAcknowledged] = useState(false);
  const [switchResults, setSwitchResults] = useState<BotSwitchResult[]>([]);

  // Dynamic fee from DB — never hardcoded
  const [feePercent, setFeePercent] = useState<number | null>(null);
  const [minBalance, setMinBalance] = useState<number>(1000);

  // Balance pre-check result
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    // Fetch dynamic fee and env minimum in parallel with bots
    fetch('/api/billing/fee-rate/default')
      .then(r => r.json())
      .then(d => setFeePercent(d.feePercent ?? null))
      .catch(() => {});

    fetchAllBots();
  }, []);

  const fetchAllBots = async () => {
    try {
      const res = await fetch('/api/bots');
      if (!res.ok) throw new Error('Failed to fetch bots');
      const data = await res.json();
      const allBots: BotInfo[] = data.bots || data;

      if (!allBots || allBots.length === 0) {
        setError('No bots found. Create a bot first before switching to live trading.');
        setStep('error');
        return;
      }

      const paperBots = allBots.filter(b => b.tradingMode === 'paper');
      if (paperBots.length === 0) {
        setError('All your bots are already in live trading mode.');
        setStep('error');
        return;
      }

      setBots(paperBots);

      // Pre-fetch balance for the first bot's exchange (all bots share one exchange per user)
      fetchBalance(paperBots[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bots');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const fetchBalance = async (bot: BotInfo) => {
    setBalanceLoading(true);
    try {
      const res = await fetch(`/api/bots/${bot.id}/balance`);
      const data = await res.json();

      // Read thresholds from balance response (reflect env vars, no hardcoding)
      const minimum: number = data.minimum ?? 1000;
      const minUsdt: number = data.minUsdt ?? 100;
      setMinBalance(minimum);

      if (!res.ok || data.available === null) {
        setBalance({
          real: 0,
          minimum,
          minUsdt,
          sufficient: true, // fail open — server-side check is authoritative
          exchange: bot.exchange,
          error: data.error || 'Could not verify balance — the server will check on switch.',
        });
        return;
      }

      const real = data.real ?? data.available ?? 0;
      const totalAccountValue = data.totalAccountValue ?? real;
      setBalance({
        real,
        minimum,
        minUsdt,
        totalAccountValue,
        sufficient: totalAccountValue >= minimum,
        exchange: bot.exchange,
      });
    } catch {
      setBalance({
        real: 0,
        minimum: 1000,
        minUsdt: 100,
        sufficient: true, // fail open
        exchange: bot.exchange,
        error: 'Could not verify balance — the server will check on switch.',
      });
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleGoLive = async () => {
    if (bots.length === 0) return;
    setStep('processing');
    setError(null);

    const results: BotSwitchResult[] = [];

    try {
      setProgressMessage(`Switching ${bots.length} bot${bots.length > 1 ? 's' : ''} to live trading...`);

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
            await new Promise(r => setTimeout(r, 500));
          }

          // Step 1b: Cancel all open paper trades — they have no real exchange positions
          // and must not carry over into live mode where they would try to place real sell orders
          setProgressMessage(`Cancelling open paper trades for ${bot.name}...`);
          try {
            await fetch(`/api/bots/${bot.id}/cancel-paper-trades`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
          } catch {
            console.warn(`Could not cancel paper trades for bot ${bot.id} — proceeding anyway`);
          }

          // Step 2: Switch to live — server enforces balance + subscription checks
          const switchRes = await fetch('/api/bots', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId: bot.id, tradingMode: 'live' }),
          });

          if (!switchRes.ok) {
            const data = await switchRes.json();
            if (data.code === 'INSUFFICIENT_BALANCE') {
              throw new Error(data.error || `Your account balance is below the $${minBalance.toLocaleString()} minimum required for live trading.`);
            }
            if (data.code === 'PAYMENT_REQUIRED') {
              throw new Error('Your trial has expired. Please contact support to continue trading.');
            }
            throw new Error(data.error || 'Failed to switch to live trading.');
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

          results.push({ botId: bot.id, botName: bot.name, success: true });
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

      const failedCount = results.filter(r => !r.success).length;
      if (failedCount === results.length) {
        throw new Error(results[0]?.error || `Failed to switch ${failedCount} bot${failedCount > 1 ? 's' : ''} to live trading.`);
      } else if (failedCount > 0) {
        setProgressMessage(`${results.length - failedCount}/${results.length} bots switched successfully`);
      }

      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStep('error');
    }
  };

  const fee = feePercent !== null ? `${feePercent}%` : '…';
  const balanceSufficient = balance === null || balance.sufficient;

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

        {/* Confirm */}
        {step === 'confirm' && bots.length > 0 && (
          <>
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 sm:px-6 py-4 sm:py-5 flex-shrink-0">
              <h2 className="text-lg sm:text-xl font-bold">Switch to Live Trading</h2>
              <p className="text-green-100 text-xs sm:text-sm mt-1 truncate">
                {bots.length === 1 ? bots[0].name : `${bots.length} bots will be switched to live`}
              </p>
            </div>

            <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-3 sm:space-y-4 overflow-y-auto flex-1">

              {/* Newbie trust note */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2.5 text-xs text-green-700 dark:text-green-300">
                <p className="font-semibold text-green-800 dark:text-green-200 mb-1">💡 Your money stays on your exchange</p>
                <p>NexusMeme never holds or moves your funds. We trade on your behalf directly on your exchange using your API keys. Log in to your exchange at any time to see every trade, balance, and P&L.</p>
              </div>

              {/* Balance check */}
              <div className={`rounded-lg p-3 sm:p-4 border ${
                balanceLoading
                  ? 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'
                  : balance?.error
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : !balanceSufficient
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              }`}>
                {balanceLoading ? (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
                    <div className="animate-spin w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full flex-shrink-0" />
                    Checking account balance…
                  </div>
                ) : balance?.error ? (
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-yellow-800 dark:text-yellow-200">⚠️ Balance unavailable</p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">{balance.error}</p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                      Minimum required: <strong>${minBalance.toLocaleString()} USDT/USD</strong>
                    </p>
                  </div>
                ) : !balanceSufficient ? (
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-red-800 dark:text-red-200">❌ Insufficient balance</p>
                    <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                      Your {balance!.exchange.toUpperCase()} account has{' '}
                      <strong>${balance!.real.toFixed(2)} USDT/USD</strong> —
                      below the <strong>${balance!.minimum.toLocaleString()}</strong> minimum for live trading.
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Fund your {balance!.exchange.toUpperCase()} account and try again.
                    </p>
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                      💡 The ${balance!.minimum.toLocaleString()} minimum is just the floor — the more capital above the minimum, the less any single trade impacts your overall balance and the fewer trading gaps you'll experience.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs sm:text-sm font-semibold text-green-800 dark:text-green-200">✅ Balance verified</p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      {balance!.exchange.toUpperCase()} account value:{' '}
                      <strong>${(balance!.totalAccountValue ?? balance!.real).toFixed(2)} USD equivalent</strong>
                      {' '}· minimum: ${balance!.minimum.toLocaleString()}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      💡 The ${balance!.minimum.toLocaleString()} minimum is just the floor — more capital above the minimum means fewer trading gaps and less impact per trade on your overall balance.
                    </p>
                    {/* USDT conversion warning — shown when total passes but stablecoin is low */}
                    {balance!.real < balance!.minUsdt && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2 mt-1">
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                          ⚠️ Low USDT balance — convert before trading
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                          You have <strong>${balance!.real.toFixed(2)} USDT/stablecoin</strong> but the bot needs at least{' '}
                          <strong>${balance!.minUsdt.toLocaleString()} USDT</strong> to place its first trade.{' '}
                          Convert some BTC or ETH to USDT on {balance!.exchange.toUpperCase()} before switching to live trading.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Exchange region notice — shown for Binance bots */}
              {bots[0]?.exchange?.toLowerCase() === 'binance' && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 text-xs sm:text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-semibold text-blue-800 dark:text-blue-200 mb-1">🌍 Binance International account required</p>
                  <ul className="space-y-1 leading-relaxed">
                    <li>• Connects to <strong>Binance International</strong> (binance.com) — available in 180+ countries</li>
                    <li>• <strong>US residents</strong>: use Binance US instead — connect keys in <strong>Settings → API Keys</strong></li>
                  </ul>
                  <p className="mt-1.5 text-blue-600 dark:text-blue-400">Connect your Binance International API keys in <strong>Settings → API Keys</strong> before continuing.</p>
                </div>
              )}
              {bots[0]?.exchange?.toLowerCase() === 'binanceus' && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 text-xs sm:text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-semibold text-blue-800 dark:text-blue-200 mb-1">🇺🇸 Binance US account required</p>
                  <ul className="space-y-1 leading-relaxed">
                    <li>• Connects to <strong>Binance US</strong> (binance.us) — for US residents</li>
                    <li>• Same 0.10% fees as Binance International</li>
                  </ul>
                  <p className="mt-1.5 text-blue-600 dark:text-blue-400">Connect your Binance US API keys in <strong>Settings → API Keys</strong> before continuing.</p>
                </div>
              )}

              {/* Irreversible warning */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 sm:p-4 space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-200">
                  ⚠️ Permanent — this cannot be undone
                </p>
                <ul className="text-xs sm:text-sm text-amber-700 dark:text-amber-300 space-y-1.5 leading-relaxed">
                  <li>• Your <strong>free trial ends permanently</strong> the moment you switch</li>
                  <li>• <strong>Paper trading is gone for good</strong> — you cannot revert to it for any reason</li>
                  <li>• {bots.length === 1 ? 'Your bot' : 'All your bots'} will trade with <strong>real funds</strong> immediately</li>
                  <li>• To test a new strategy, use small live capital — there is no sandbox after this point</li>
                  <li>• <strong>Trial performance is not a guarantee of live results</strong> — paper trading does not account for real spreads, slippage, or order fill prices. Live performance may differ from what you saw during the trial</li>
                </ul>
              </div>

              {/* Bot list if >1 */}
              {bots.length > 1 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 max-h-32 overflow-y-auto">
                  <p className="text-xs sm:text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                    Bots to be switched ({bots.length}):
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    {bots.map(bot => (
                      <li key={bot.id} className="truncate">• {bot.name} {bot.isActive && '(running)'}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What happens */}
              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <p className="font-medium text-slate-800 dark:text-slate-200">What happens next:</p>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">1.</span>
                  <p className="leading-relaxed">{bots.length === 1 ? 'Bot' : 'All bots'} will be stopped briefly if running</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">2.</span>
                  <p className="leading-relaxed">Trading mode switches from paper to live</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">3.</span>
                  <p className="leading-relaxed">{bots.length === 1 ? 'Bot restarts' : 'Bots restart'} automatically in live mode</p>
                </div>
              </div>

              {/* Performance fee acknowledgment — dynamic rate, correct payment copy */}
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3">
                <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                  <p className="font-medium mb-1">Performance Fees</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {fee} on profitable trades only, billed monthly. Pay with USDC on Base — no subscription fees.
                  </p>
                </div>

                <label className="flex items-start gap-2 sm:gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={feeAcknowledged}
                    onChange={e => setFeeAcknowledged(e.target.checked)}
                    className="mt-0.5 w-4 h-4 flex-shrink-0 rounded border-slate-300 dark:border-slate-600 text-green-600 focus:ring-green-500 cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    I acknowledge that a <strong>{fee} performance fee</strong> applies to all profitable trades.{' '}
                    <a
                      href="/legal/terms#performance-fees"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 dark:text-green-400 underline hover:text-green-700 dark:hover:text-green-300 whitespace-nowrap"
                      onClick={e => e.stopPropagation()}
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
                disabled={!feeAcknowledged || !balanceSufficient || balanceLoading}
                className={`flex-1 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition touch-manipulation ${
                  feeAcknowledged && balanceSufficient && !balanceLoading
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

        {/* Processing */}
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

        {/* Success */}
        {step === 'success' && (
          <>
            <div className="px-4 sm:px-6 py-8 sm:py-10 overflow-y-auto flex-1">
              <div className="text-4xl sm:text-5xl mb-4 text-center">🎉</div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-2 text-center">
                You&apos;re Live!
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm text-center mb-4 leading-relaxed px-2">
                {switchResults.length === 1 ? 'Your bot is' : 'Your bots are'} now trading with real funds.
                Profits will appear in your trading dashboard.
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-xs text-center px-2">
                Performance fees of {fee} on profits are billed monthly on the 1st.
                Pay with USDC on Base via your Billing Dashboard.
              </p>

              {switchResults.length > 1 && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 sm:p-4 mt-4 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Switch Results:</p>
                  <ul className="text-xs space-y-1">
                    {switchResults.map(result => (
                      <li key={result.botId} className={`${result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} truncate`}>
                        {result.success ? '✓' : '✗'} {result.botName} {result.error && `— ${result.error}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
              <button
                onClick={() => { onComplete(); onClose(); }}
                className="w-full px-4 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition touch-manipulation"
              >
                Done
              </button>
            </div>
          </>
        )}

        {/* Error */}
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
