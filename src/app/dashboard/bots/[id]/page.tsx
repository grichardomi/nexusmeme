'use client';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { BotTradesList } from '@/components/bots/BotTradesList';
import { BotTradeStats } from '@/components/bots/BotTradeStats';
import { BotConfiguration } from '@/components/bots/BotConfiguration';
import { PositionHealthMonitor } from '@/components/bots/PositionHealthMonitor';
import { BillingSetupModal } from '@/components/billing/BillingSetupModal';
import { ConfirmDeleteModal } from '@/components/modals/ConfirmDeleteModal';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { useSession } from 'next-auth/react';
import { redirect, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';

/**
 * Bot Detail Page
 * View and manage individual trading bot
 */

interface Bot {
  id: string;
  exchange: string;
  enabledPairs: string[];
  isActive: boolean;
  createdAt: string;
  tradingMode: 'paper' | 'live';
  totalTrades: number;
  profitLoss: number;
  initialCapital: number; // 0 = unlimited (uses real exchange balance)
  config?: Record<string, any>;
  name?: string;
}

const SUPPORTED_PAIRS = ['BTC/USD', 'BTC/USDT', 'ETH/USD', 'ETH/USDT'];

export default function BotDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const { status } = useSession();
  const showBillingSetup = searchParams.get('setupBilling') === 'true';
  const [bot, setBot] = useState<Bot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isEditingPairs, setIsEditingPairs] = useState(false);
  const [selectedPairs, setSelectedPairs] = useState<string[]>([]);
  const [isUpdatingPairs, setIsUpdatingPairs] = useState(false);
  const [isTogglingMode, setIsTogglingMode] = useState(false);
  const [isStartingBot, setIsStartingBot] = useState(false);
  const [isStoppingBot, setIsStoppingBot] = useState(false);
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editBotName, setEditBotName] = useState('');
  const [editExchange, setEditExchange] = useState('');
  const [editInitialCapital, setEditInitialCapital] = useState('');
  const [editCapitalMode, setEditCapitalMode] = useState<'fixed' | 'unlimited'>('fixed');
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [lastBalanceUpdate, setLastBalanceUpdate] = useState<Date | null>(null);
  const [showLiveTradeConfirm, setShowLiveTradeConfirm] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [openTradesCount, setOpenTradesCount] = useState(0);
  const [unpaidFeesError, setUnpaidFeesError] = useState<{ amount: number; count: number } | null>(null);

  if (status === 'unauthenticated') {
    redirect('/auth/signin');
  }

  const handleOpenDeleteModal = () => {
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/bots?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to delete bot');
        setShowDeleteModal(false);
        return;
      }

      router.push('/dashboard/bots');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
  };

  const handleEditPairsClick = () => {
    setIsEditingPairs(true);
    setSelectedPairs(bot?.enabledPairs || []);
    setError(null);
  };

  const handleEditSettingsClick = () => {
    setEditBotName(bot?.name || `${bot?.exchange} Trading Bot` || '');
    setEditExchange(bot?.exchange || 'binance');

    const initialCapital = bot?.initialCapital;
    // Check if unlimited (0 = unlimited, uses real exchange balance)
    const isUnlimited = initialCapital === 0;
    if (isUnlimited) {
      setEditCapitalMode('unlimited');
      setEditInitialCapital('');
    } else {
      setEditCapitalMode('fixed');
      setEditInitialCapital(initialCapital?.toString() || '1000');
    }

    setIsEditingSettings(true);
    setError(null);
  };

  const handleUpdateSettings = async () => {
    if (!editBotName.trim()) {
      setError('Bot name is required');
      return;
    }

    let capital: number;

    if (editCapitalMode === 'unlimited') {
      capital = 0; // 0 represents unlimited
    } else {
      const capitalNum = parseFloat(editInitialCapital);
      if (isNaN(capitalNum) || capitalNum < 100) {
        setError('Initial capital must be at least 100 (or 0 for unlimited)');
        return;
      }
      capital = capitalNum;
    }

    setIsUpdatingSettings(true);
    try {
      console.log('Updating bot settings:', { botId: id, name: editBotName, exchange: editExchange, initialCapital: capital });

      const response = await fetch('/api/bots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: id,
          name: editBotName,
          exchange: editExchange,
          initialCapital: capital,
        }),
      });

      const data = await response.json();
      console.log('API Response:', { status: response.status, data });

      if (!response.ok) {
        setError(data.error || 'Failed to update bot settings');
        return;
      }

      console.log('Bot settings updated successfully, refetching bot...');
      setIsEditingSettings(false);
      setError(null);

      // Refetch the bot to get the latest data from the server
      await fetchBot();
    } catch (err) {
      console.error('Error updating bot settings:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleUpdatePairs = async () => {
    if (selectedPairs.length === 0) {
      setError('At least one trading pair is required');
      return;
    }

    setIsUpdatingPairs(true);
    try {
      const response = await fetch('/api/bots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: id,
          enabledPairs: selectedPairs,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to update trading pairs');
        return;
      }

      setIsEditingPairs(false);
      setError(null);

      // Refetch the bot to ensure fresh data
      await fetchBot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsUpdatingPairs(false);
    }
  };

  const togglePair = (pair: string) => {
    setSelectedPairs(prev =>
      prev.includes(pair)
        ? prev.filter(p => p !== pair)
        : [...prev, pair]
    );
  };

  const handleToggleTradingMode = async () => {
    if (!bot) return;

    const newMode = bot.tradingMode === 'paper' ? 'live' : 'paper';

    if (newMode === 'live') {
      setShowLiveTradeConfirm(true);
      return;
    }

    await performToggleTradingMode(newMode);
  };

  const performToggleTradingMode = async (mode: 'paper' | 'live') => {
    setShowLiveTradeConfirm(false);
    setIsTogglingMode(true);
    try {
      const response = await fetch('/api/bots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: id,
          tradingMode: mode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle unpaid fees error with clear guidance
        if (data.code === 'UNPAID_FEES') {
          setUnpaidFeesError({
            amount: Number(data.unpaidAmount),
            count: data.feeCount,
          });
          setError(null); // Clear generic error, use specific unpaid fees banner
        } else {
          setError(data.error || 'Failed to update trading mode');
          setUnpaidFeesError(null);
        }
        return;
      }

      setError(null);
      setUnpaidFeesError(null);

      // Refetch the bot to ensure fresh data
      await fetchBot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsTogglingMode(false);
    }
  };

  const confirmToggleTradingMode = () => {
    if (!bot) return;
    const newMode = bot.tradingMode === 'paper' ? 'live' : 'paper';
    performToggleTradingMode(newMode);
  };

  const handleStartBot = async () => {
    if (!bot) return;

    setIsStartingBot(true);
    try {
      const response = await fetch('/api/bots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: id,
          status: 'running',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to start bot');
        return;
      }

      setError(null);

      // Refetch the bot to ensure fresh data
      await fetchBot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsStartingBot(false);
    }
  };

  const handleOpenStopBotConfirm = async () => {
    // Fetch open trades count for accurate message
    try {
      const response = await fetch(`/api/trades?botId=${id}&limit=500`);
      if (response.ok) {
        const data = await response.json();
        const openTrades = (data.trades || []).filter((t: any) => t.status === 'open');
        setOpenTradesCount(openTrades.length);
      }
    } catch (err) {
      console.error('Failed to fetch open trades count:', err);
      setOpenTradesCount(0);
    }
    setShowPauseConfirm(true);
  };

  const handleConfirmStopBot = async () => {
    setShowPauseConfirm(false);
    setIsStoppingBot(true);
    try {
      // Step 1: Close all open trades (if any exist)
      if (openTradesCount > 0) {
        const closeResponse = await fetch('/api/bots/trades/close-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botId: id }),
        });

        if (!closeResponse.ok) {
          const data = await closeResponse.json();
          setError(data.error || 'Failed to close trades');
          setIsStoppingBot(false);
          return;
        }
      }

      // Step 2: Pause the bot
      const pauseResponse = await fetch('/api/bots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: id,
          status: 'stopped',
        }),
      });

      const data = await pauseResponse.json();

      if (!pauseResponse.ok) {
        setError(data.error || 'Failed to stop bot');
        return;
      }

      setError(null);

      // Refetch the bot to ensure fresh data
      await fetchBot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsStoppingBot(false);
    }
  };

  const fetchBot = async () => {
    try {
      console.log('Fetching bot:', id);
      const response = await fetch('/api/bots');
      if (!response.ok) {
        throw new Error('Failed to fetch bots');
      }
      const bots = await response.json();
      console.log('[fetchBot] All bots from API:', JSON.stringify(bots, null, 2));

      const currentBot = bots.find((b: Bot) => b.id === id);

      if (!currentBot) {
        setError('Bot not found');
        return;
      }

      console.log('[fetchBot] Current bot found:', {
        id: currentBot.id,
        initialCapital: currentBot.initialCapital,
        initialCapitalType: typeof currentBot.initialCapital,
        configInitialCapital: currentBot.config?.initialCapital,
        configInitialCapitalType: typeof currentBot.config?.initialCapital,
        fullBot: currentBot,
      });
      setBot(currentBot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLiveBalance = async (showLoading = false) => {
    if (showLoading) {
      setIsLoadingBalance(true);
    }

    try {
      const response = await fetch(`/api/bots/${id}/balance`);

      if (!response.ok) {
        const data = await response.json();
        setBalanceError(data.error || 'Failed to fetch balance');
        setLiveBalance(null);
        if (showLoading) {
          setIsLoadingBalance(false);
        }
        return;
      }

      const data = await response.json();
      setLiveBalance(data.available);
      setBalanceError(null);
      setLastBalanceUpdate(new Date());
      console.log('Fetched live balance:', data.available);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error fetching balance:', errorMsg);
      setBalanceError(errorMsg);
      setLiveBalance(null);
    } finally {
      if (showLoading) {
        setIsLoadingBalance(false);
      }
    }
  };

  useEffect(() => {
    fetchBot();
  }, [id]);

  // Auto-refresh balance every 10 seconds for unlimited capital bots (paper or live)
  useEffect(() => {
    if (!bot) {
      return;
    }

    // Check if bot has unlimited capital (0 = unlimited)
    const isUnlimited = bot.initialCapital === 0;

    if (!isUnlimited) {
      return;
    }

    // Fetch immediately on mount
    fetchLiveBalance(false);

    // Set up auto-refresh interval
    const intervalId = setInterval(() => {
      fetchLiveBalance(false);
    }, 10000); // 10 seconds

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [bot?.id, bot?.initialCapital]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-900 dark:text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (error || !bot) {
    return (
      <DashboardLayout title="Bot Details">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          <p className="font-medium">{error || 'Bot not found'}</p>
          <Link
            href="/dashboard/bots"
            className="text-red-600 dark:text-red-400 hover:underline mt-2 inline-block"
          >
            Back to Bots
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // Check if bot has unlimited capital (0 = unlimited, uses real exchange balance)
  // Note: initialCapital is a top-level field returned from the API, not nested in config
  const initialCapital = bot?.initialCapital;
  const isUnlimitedCapital = initialCapital === 0;

  // Debug logging
  if (bot) {
    console.log('[BotDetail] Bot data:', {
      botId: bot.id,
      initialCapital: bot.initialCapital,
      initialCapitalType: typeof bot.initialCapital,
      isUnlimitedCapital,
      configInitialCapital: bot.config?.initialCapital,
      botName: bot.name,
    });
  }

  return (
    <DashboardLayout title={bot.name || `${bot.exchange} Trading Bot`}>
      <div className="mb-6">
        <Link
          href="/dashboard/bots"
          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
        >
          ← Back to Bots
        </Link>
      </div>

      {/* Unpaid Fees Warning Banner */}
      {unpaidFeesError && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💰</span>
            <div className="flex-1">
              <h4 className="font-semibold text-amber-800 dark:text-amber-200">
                Cannot Switch to Paper Trading
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                You have <strong>${unpaidFeesError.amount.toFixed(2)}</strong> in unpaid performance fees
                from {unpaidFeesError.count} profitable trade{unpaidFeesError.count !== 1 ? 's' : ''}.
                Pay your outstanding fees to switch to paper trading mode.
              </p>
              <div className="flex gap-3 mt-3">
                <Link
                  href="/dashboard/billing"
                  className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition"
                >
                  Pay Fees →
                </Link>
                <button
                  onClick={() => setUnpaidFeesError(null)}
                  className="px-4 py-2 text-amber-700 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bot Settings Card */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Bot Settings
              </h3>
              <button
                onClick={handleEditSettingsClick}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
              >
                ✏️ Edit
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Bot Name</p>
                <p className="font-medium text-slate-900 dark:text-white mt-1">
                  {bot.name || `${bot.exchange} Trading Bot`}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {isUnlimitedCapital ? 'Available Balance' : 'Initial Capital'}
                  </p>
                  {isUnlimitedCapital && (
                    <button
                      onClick={() => fetchLiveBalance(true)}
                      disabled={isLoadingBalance}
                      title="Refresh balance from exchange"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:text-slate-400"
                    >
                      {isLoadingBalance ? '⟳ Refreshing...' : '⟳ Refresh'}
                    </button>
                  )}
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {isUnlimitedCapital
                    ? isLoadingBalance && liveBalance === null
                      ? '⟳ Loading...'
                      : liveBalance !== null
                      ? `$${liveBalance.toFixed(2)} 🔓`
                      : '⚠️ Unavailable'
                    : `$${initialCapital.toLocaleString()}`}
                </p>
                {isUnlimitedCapital && (
                  <>
                    {balanceError && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{balanceError}</p>
                    )}
                    {lastBalanceUpdate && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {bot.tradingMode === 'live' ? '🔴 Live' : '📄 Dry-run'} • Updated: {lastBalanceUpdate.toLocaleTimeString()}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Exchange</p>
                <p className="font-medium text-slate-900 dark:text-white mt-1">
                  {bot.exchange.toUpperCase()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bot Status Card */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Bot Status
            </h3>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Status</p>
                <p className="text-2xl font-bold">
                  {bot.isActive ? (
                    <span className="text-green-600 dark:text-green-400">🟢 Active</span>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">🔴 Inactive</span>
                  )}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Trading Mode</p>
                <button
                  onClick={handleToggleTradingMode}
                  disabled={isTogglingMode || bot.isActive}
                  title={bot.isActive ? 'Stop the bot to change trading mode' : 'Click to toggle trading mode'}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition cursor-pointer ${
                    bot.tradingMode === 'paper'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                  } ${isTogglingMode || bot.isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isTogglingMode ? 'Updating...' : (bot.tradingMode === 'paper' ? '📄 Paper Trading' : '🔴 Live Trading')}
                </button>
              </div>

              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Created</p>
                <p className="text-slate-900 dark:text-white mt-1">
                  {new Date(bot.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bot Details Card */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">
              Trading Information
            </h3>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Trading Pairs</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    {bot.enabledPairs.map(pair => (
                      <p
                        key={pair}
                        className="font-medium text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded inline-block mr-2 mb-2"
                      >
                        {pair}
                      </p>
                    ))}
                  </div>
                  <button
                    onClick={handleEditPairsClick}
                    className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition"
                  >
                    ✏️ Add/Remove Pairs
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Trades</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {bot.totalTrades}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Profit/Loss</p>
                <p
                  className={`text-3xl font-bold mt-2 ${
                    bot.profitLoss >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  ${bot.profitLoss.toFixed(2)}
                </p>
              </div>

            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-4">
            {!bot.isActive ? (
              <button
                onClick={handleStartBot}
                disabled={isStartingBot}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white px-6 py-3 rounded font-medium transition"
              >
                {isStartingBot ? 'Starting...' : '▶️ Start Bot'}
              </button>
            ) : (
              <button
                onClick={handleOpenStopBotConfirm}
                disabled={isStoppingBot}
                className={`flex-1 text-white px-6 py-3 rounded font-medium transition ${
                  isStoppingBot
                    ? 'bg-slate-400 dark:bg-slate-600 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600'
                }`}
                title={openTradesCount > 0 ? 'Close all positions and pause trading' : 'Pause trading'}
              >
                {isStoppingBot ? 'Stopping...' : `⏹️ Stop Bot${openTradesCount > 0 ? ` (${openTradesCount} positions)` : ''}`}
              </button>
            )}

            <button
              onClick={handleOpenDeleteModal}
              disabled={isDeleting || bot.isActive}
              title={bot.isActive ? 'Stop the bot before deleting' : 'Delete this bot'}
              className="flex-1 bg-red-700 hover:bg-red-800 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white px-6 py-3 rounded font-medium transition"
            >
              {isDeleting ? 'Deleting...' : '🗑️ Delete Bot'}
            </button>
          </div>
        </div>
      </div>

      {/* Configuration Section */}
      <div className="mt-8">
        <BotConfiguration
          exchange={bot.exchange}
          enabledPairs={bot.enabledPairs}
          tradingMode={bot.tradingMode}
          config={bot.config || {}}
        />
      </div>

      {/* Position Health Monitor */}
      <div className="mt-8">
        <PositionHealthMonitor botId={id} />
      </div>

      {/* Trade Statistics Summary */}
      <div className="mt-8">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
          Trading Performance
        </h2>
        <BotTradeStats botId={id} />
      </div>

      {/* Recent Trades Section */}
      <div className="mt-8">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">
            Recent Trades
          </h3>
          <BotTradesList botId={id} />
        </div>
      </div>

      {/* Edit Bot Settings Modal */}
      {isEditingSettings && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Edit Bot Settings
            </h3>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Bot Name
                </label>
                <input
                  type="text"
                  value={editBotName}
                  onChange={(e) => setEditBotName(e.target.value)}
                  disabled={isUpdatingSettings}
                  placeholder="e.g., My Trading Bot"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Exchange
                </label>
                <select
                  value={editExchange}
                  onChange={(e) => setEditExchange(e.target.value)}
                  disabled={isUpdatingSettings}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="binance">Binance</option>
                  <option value="kraken">Kraken</option>
                  <option value="coinbase">Coinbase</option>
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Requires API keys connected in Settings
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Position Sizing
                </label>

                <div className="space-y-3 mb-4">
                  <label className="flex items-center gap-3 cursor-pointer p-3 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    style={{
                      backgroundColor: editCapitalMode === 'fixed' ? 'rgb(219 234 254)' : 'transparent',
                      borderColor: editCapitalMode === 'fixed' ? 'rgb(59 130 246)' : undefined
                    }}
                  >
                    <input
                      type="radio"
                      name="capitalMode"
                      value="fixed"
                      checked={editCapitalMode === 'fixed'}
                      onChange={() => {
                        setEditCapitalMode('fixed');
                        // Auto-populate with default if empty
                        if (!editInitialCapital) {
                          setEditInitialCapital('1000');
                        }
                      }}
                      disabled={isUpdatingSettings}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <p className="text-slate-900 dark:text-white font-medium">Fixed Amount</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Specify exact capital amount</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer p-3 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    style={{
                      backgroundColor: editCapitalMode === 'unlimited' ? 'rgb(219 234 254)' : 'transparent',
                      borderColor: editCapitalMode === 'unlimited' ? 'rgb(59 130 246)' : undefined
                    }}
                  >
                    <input
                      type="radio"
                      name="capitalMode"
                      value="unlimited"
                      checked={editCapitalMode === 'unlimited'}
                      onChange={() => {
                        setEditCapitalMode('unlimited');
                        setEditInitialCapital('');
                      }}
                      disabled={isUpdatingSettings}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <p className="text-slate-900 dark:text-white font-medium">Unlimited 🔓</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Use entire exchange balance</p>
                    </div>
                  </label>
                </div>

                {editCapitalMode === 'fixed' && (
                  <div>
                    <input
                      type="number"
                      value={editInitialCapital}
                      onChange={(e) => setEditInitialCapital(e.target.value)}
                      disabled={isUpdatingSettings}
                      placeholder="e.g., 1000"
                      min="100"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Minimum: $100</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsEditingSettings(false)}
                disabled={isUpdatingSettings}
                className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:bg-slate-400 text-slate-900 dark:text-white px-4 py-2 rounded font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateSettings}
                disabled={isUpdatingSettings}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white px-4 py-2 rounded font-medium transition"
              >
                {isUpdatingSettings ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Trading Pairs Modal */}
      {isEditingPairs && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Edit Trading Pairs
            </h3>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-3 mb-6">
              {SUPPORTED_PAIRS.map(pair => (
                <label
                  key={pair}
                  className="flex items-center gap-3 cursor-pointer p-3 border border-slate-200 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedPairs.includes(pair)}
                    onChange={() => togglePair(pair)}
                    disabled={isUpdatingPairs}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <span className="text-slate-900 dark:text-white font-medium">{pair}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsEditingPairs(false)}
                disabled={isUpdatingPairs}
                className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:bg-slate-400 text-slate-900 dark:text-white px-4 py-2 rounded font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdatePairs}
                disabled={isUpdatingPairs || selectedPairs.length === 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white px-4 py-2 rounded font-medium transition"
              >
                {isUpdatingPairs ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Billing Setup Modal - shown after bot creation */}
      {showBillingSetup && bot && <BillingSetupModal botId={bot.id} botName={`${bot.exchange} Bot`} />}

      {/* Live Trading Confirmation Modal */}
      <ConfirmationModal
        isOpen={showLiveTradeConfirm}
        title="⚠️ Switch to Live Trading"
        message="WARNING: Live trading uses REAL funds! Make sure you have tested your bot in Paper mode first. You will be trading with actual money. Are you sure you want to proceed?"
        confirmText="Switch to Live Trading"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={isTogglingMode}
        onConfirm={confirmToggleTradingMode}
        onCancel={() => setShowLiveTradeConfirm(false)}
      />

      {/* Stop Bot Confirmation Modal */}
      <ConfirmationModal
        isOpen={showPauseConfirm}
        title={openTradesCount === 0 ? "⚠️ Stop Bot" : `🔴 Stop Bot (${openTradesCount} Position${openTradesCount === 1 ? '' : 's'})`}
        message={openTradesCount === 0
          ? `You currently have no open positions. Are you sure you want to stop this bot?`
          : `This will IMMEDIATELY close all ${openTradesCount} open position${openTradesCount === 1 ? '' : 's'} at current market prices, then pause trading.

⚠️ All positions will be liquidated. This cannot be undone.`}
        confirmText={openTradesCount === 0 ? "Stop Bot" : "Stop & Close All"}
        cancelText="Cancel"
        isDangerous={openTradesCount > 0}
        isLoading={isStoppingBot}
        onConfirm={handleConfirmStopBot}
        onCancel={() => setShowPauseConfirm(false)}
      />

      {/* Delete Bot Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        title="Delete Trading Bot"
        description="This will permanently delete your trading bot and all associated historical data. This action cannot be undone."
        itemsToDelete={[
          { label: 'Bot Instance', value: bot.name || `${bot.exchange} Trading Bot` },
          { label: 'Trade History', value: `${bot.totalTrades} trades` },
          { label: 'Performance Records', value: 'All fee data' },
          { label: 'Bot Suspension Logs', value: 'All suspension history' },
        ]}
        confirmationText="DELETE"
        confirmButtonText="Delete Permanently"
        isDangerous={true}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </DashboardLayout>
  );
}
