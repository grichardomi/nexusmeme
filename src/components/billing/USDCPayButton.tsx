'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

interface USDCInvoice {
  id: string;
  reference: string;
  amount: number;
  walletAddress: string;
  expiresAt: string;
  status: string;
}

interface USDCPayStatus {
  enabled: boolean;
  walletAddress: string | null;
  usdcContract: string | null;
  chainId: number;
  network: string;
  pendingFees: { count: number; totalAmount: number };
  activeInvoice: USDCInvoice | null;
  summary: {
    total_profits: number;
    total_fees_collected: number;
    pending_fees: number;
  };
}

type MetaMaskState = 'idle' | 'connecting' | 'switching_network' | 'sending' | 'awaiting_confirm' | 'done' | 'error';
type WalletConnectState = MetaMaskState;

interface USDCPayButtonProps {
  tradingMode?: 'paper' | 'live';
}

// Encode ERC-20 transfer(address,uint256) calldata without ethers/viem dependency
function encodeUSDCTransfer(toAddress: string, rawAmount: number): string {
  const selector = 'a9059cbb'; // keccak256("transfer(address,uint256)") first 4 bytes
  const paddedAddress = toAddress.replace(/^0x/, '').padStart(64, '0');
  const paddedAmount = rawAmount.toString(16).padStart(64, '0');
  return `0x${selector}${paddedAddress}${paddedAmount}`;
}

export function USDCPayButton({ tradingMode }: USDCPayButtonProps) {
  const [status, setStatus] = useState<USDCPayStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [copied, setCopied] = useState<'address' | 'reference' | 'amount' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mmState, setMmState] = useState<MetaMaskState>('idle');
  const [mmTxHash, setMmTxHash] = useState<string | null>(null);
  const [hasMetaMask, setHasMetaMask] = useState(false);
  const [wcState, setWcState] = useState<WalletConnectState>('idle');
  const [wcTxHash, setWcTxHash] = useState<string | null>(null);
  const wcProviderRef = useRef<unknown>(null);

  const mockMode =
    process.env.NEXT_PUBLIC_USDC_PAYMENT_MOCK === 'true' ||
    process.env.NEXT_PUBLIC_USDC_PAYMENT_MOCK === '1';
  const invoiceEndpoint = mockMode ? '/api/billing/usdc/invoice?mock=1' : '/api/billing/usdc/invoice';
  const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

  const baseRpcUrl = useCallback((chainId: number) => (
    chainId === 84532 ? 'https://sepolia.base.org' : 'https://mainnet.base.org'
  ), []);

  const baseExplorerUrl = status?.chainId === 84532 ? 'https://sepolia.basescan.org' : 'https://basescan.org';

  useEffect(() => {
    setHasMetaMask(typeof window !== 'undefined' && !!window.ethereum);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      setChecking(true);
      const res = await fetch(invoiceEndpoint);
      const data = await res.json();
      setStatus(data.enabled ? data : null);
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, [invoiceEndpoint]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Reset MetaMask state when the active invoice changes (new invoice after a completed payment)
  useEffect(() => {
    if (mmState === 'done') setMmState('idle');
    if (wcState === 'done') setWcState('idle');
  }, [status?.activeInvoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateInvoice = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(invoiceEndpoint, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create invoice'); return; }
      await fetchStatus();
    } catch {
      setError('Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleMetaMaskPay = async (invoice: USDCInvoice) => {
    if (!window.ethereum || !status?.usdcContract) return;
    setError(null);
    setMmTxHash(null);

    if (mockMode) {
      setMmState('sending');
      setTimeout(() => {
        setMmTxHash('0xmockedtransactionhash');
        setMmState('done');
      }, 800);
      return;
    }

    try {
      // 1. Connect wallet
      setMmState('connecting');
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts[0]) throw new Error('No account selected in MetaMask');

      // 2. Switch to correct network (Base)
      setMmState('switching_network');
      const targetChainHex = `0x${status.chainId.toString(16)}`;
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: targetChainHex }],
        });
      } catch (switchErr: unknown) {
        // Chain not added yet (error code 4902) — add Base network
        if ((switchErr as { code?: number }).code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: targetChainHex,
              chainName: 'Base',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://mainnet.base.org'],
              blockExplorerUrls: ['https://basescan.org'],
            }],
          });
        } else {
          throw switchErr;
        }
      }

      // 3. Build USDC transfer calldata — exact micro-amount from invoice
      const rawAmount = Math.round(Number(invoice.amount) * 1_000_000);
      const calldata = encodeUSDCTransfer(invoice.walletAddress, rawAmount);

      // 4. Send transaction
      setMmState('sending');
      const txHash = (await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: accounts[0],
          to: status.usdcContract,
          data: calldata,
          chainId: targetChainHex,
        }],
      })) as string;

      setMmTxHash(txHash);
      setMmState('awaiting_confirm');

      // 5. Poll on-chain confirm endpoint (no webhook dependency — works local + prod)
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch('/api/billing/usdc/invoice/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txHash }),
          });
          const data = await res.json();
          if (data.confirmed) {
            clearInterval(poll);
            setMmState('done');
            await fetchStatus();
            return;
          }
        } catch { /* keep polling */ }
        if (attempts >= 12) {
          clearInterval(poll);
          setMmState('done');
          await fetchStatus();
        }
      }, 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'MetaMask payment failed';
      // User rejected — don't show as error
      if ((err as { code?: number }).code === 4001) {
        setMmState('idle');
      } else {
        setError(msg);
        setMmState('error');
      }
    }
  };

  const copyToClipboard = async (text: string, type: 'address' | 'reference' | 'amount') => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleWalletConnectPay = async (invoice: USDCInvoice) => {
    if (!status?.usdcContract || !wcProjectId) return;
    setError(null);
    setWcTxHash(null);

    if (mockMode) {
      setWcState('sending');
      setTimeout(() => {
        setWcTxHash('0xmockedtransactionhash');
        setWcState('done');
      }, 800);
      return;
    }

    try {
      setWcState('connecting');
      if (!wcProviderRef.current) {
        const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
        wcProviderRef.current = await EthereumProvider.init({
          projectId: wcProjectId,
          chains: [status.chainId],
          optionalChains: [status.chainId],
          showQrModal: true,
          rpcMap: { [status.chainId]: baseRpcUrl(status.chainId) },
          metadata: {
            name: 'NexusMeme Billing',
            description: 'Pay performance fees in USDC',
            url: typeof window !== 'undefined' ? window.location.origin : 'https://app',
            icons: ['https://app.nexusmeme.ai/icon.png'],
          },
        });
      }

      const provider = wcProviderRef.current as unknown as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; accounts?: string[] };

      const accounts = provider.accounts || (await provider.request({ method: 'eth_requestAccounts' }) as string[]);
      if (!accounts || !accounts[0]) throw new Error('No wallet selected');

      setWcState('switching_network');
      const targetChainHex = `0x${status.chainId.toString(16)}`;
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetChainHex }] });
      } catch (switchErr: unknown) {
        const addParams = {
          chainId: targetChainHex,
          chainName: status.chainId === 84532 ? 'Base Sepolia' : 'Base',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [baseRpcUrl(status.chainId)],
          blockExplorerUrls: [baseExplorerUrl],
        };
        if ((switchErr as { code?: number }).code === 4902 || (switchErr as Error)?.message?.includes('Unrecognized chain')) {
          try {
            await provider.request({ method: 'wallet_addEthereumChain', params: [addParams] });
          } catch {
            setError('Please switch to Base in your wallet, then retry.');
            setWcState('error');
            return;
          }
        } else {
          setError('Please switch to Base in your wallet, then retry.');
          setWcState('error');
          return;
        }
      }

      const rawAmount = Math.round(Number(invoice.amount) * 1_000_000);
      const calldata = encodeUSDCTransfer(invoice.walletAddress, rawAmount);

      setWcState('sending');
      const txHash = (await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: accounts[0],
          to: status.usdcContract,
          data: calldata,
          chainId: targetChainHex,
        }],
      })) as string;

      setWcTxHash(txHash);
      setWcState('awaiting_confirm');

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch('/api/billing/usdc/invoice/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txHash }),
          });
          const data = await res.json();
          if (data.confirmed) {
            clearInterval(poll);
            setWcState('done');
            await fetchStatus();
            return;
          }
        } catch { /* keep polling */ }
        if (attempts >= 12) {
          clearInterval(poll);
          setWcState('done');
          await fetchStatus();
        }
      }, 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'WalletConnect payment failed';
      if ((err as { code?: number }).code === 4001) {
        setWcState('idle');
      } else {
        setError(msg);
        setWcState('error');
      }
    }
  };

  if (tradingMode === 'paper' && !mockMode) return null;
  if (checking) return <div className="animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg h-24" />;
  if (!status) return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
      USDC payment not configured — set <code className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">USDC_PAYMENT_ENABLED=true</code> and restart.
    </div>
  );

  const { pendingFees, activeInvoice } = status;
  const hasPending = pendingFees.count > 0;
  const mmBusy = mmState === 'connecting' || mmState === 'switching_network' || mmState === 'sending' || mmState === 'awaiting_confirm';
  const wcBusy = wcState === 'connecting' || wcState === 'switching_network' || wcState === 'sending' || wcState === 'awaiting_confirm';
  const wcMissing = !wcProjectId;

  const mmLabel = {
    idle: `Pay $${Number(activeInvoice?.amount || 0).toFixed(2)} with MetaMask`,
    connecting: 'Connecting wallet...',
    switching_network: 'Switching to Base...',
    sending: 'Confirm in MetaMask...',
    awaiting_confirm: 'Awaiting confirmation...',
    done: 'Payment sent!',
    error: 'Retry with MetaMask',
  }[mmState];

  const wcLabel = {
    idle: `Pay $${Number(activeInvoice?.amount || 0).toFixed(2)} with WalletConnect`,
    connecting: 'Open your wallet...',
    switching_network: 'Switching to Base...',
    sending: 'Confirm in wallet...',
    awaiting_confirm: 'Awaiting confirmation...',
    done: 'Payment sent!',
    error: 'Retry with WalletConnect',
  }[wcState];

  const anyTxHash = mmTxHash || wcTxHash;
  const paymentDone = mmState === 'done' || wcState === 'done';

  return (
    <div id="crypto-pay-section" className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Pay with USDC</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Direct on Base · No processor · Instant confirmation
          </p>
        </div>
        <span className="ml-auto text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full font-medium">
          Always online
        </span>
      </div>

      {/* Pending fees summary */}
      {hasPending && !activeInvoice && (
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex justify-between items-center">
            <span className="text-amber-800 dark:text-amber-200 text-sm">
              {pendingFees.count} pending fee{pendingFees.count > 1 ? 's' : ''}
            </span>
            <span className="font-bold text-amber-900 dark:text-amber-100">
              ${Number(pendingFees.totalAmount).toFixed(2)} USDC
            </span>
          </div>
        </div>
      )}

      {/* Active invoice — payment options */}
      {activeInvoice && (
        <div className="mb-4 space-y-3">
          {/* MetaMask one-click pay — show install hint if not detected */}
          {!hasMetaMask && !wcProjectId && (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-1">
              No wallet detected — install <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="underline">MetaMask</a> or use manual payment below.
            </p>
          )}
          {hasMetaMask && status.usdcContract && mmState !== 'done' && (
            <button
              onClick={() => handleMetaMaskPay(activeInvoice)}
              disabled={mmBusy}
              className="w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-400 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
            >
              {mmBusy ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {mmLabel}
                </>
              ) : (
                <>
                  {/* MetaMask fox icon */}
                  <svg className="w-5 h-5" viewBox="0 0 35 33" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M32.9 1L19.4 10.7l2.5-5.9L32.9 1z" fill="#E17726" stroke="#E17726" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2.1 1l13.4 9.8-2.4-5.9L2.1 1z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M28.2 23.5l-3.6 5.5 7.7 2.1 2.2-7.5-6.3-.1z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M.5 23.6l2.2 7.5 7.7-2.1-3.6-5.5-6.3.1z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {mmLabel}
                </>
              )}
            </button>
          )}

          {/* WalletConnect universal pay */}
          {wcProjectId && status.usdcContract && wcState !== 'done' && (
            <button
              onClick={() => handleWalletConnectPay(activeInvoice)}
              disabled={wcBusy}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-500 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
            >
              {wcBusy ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {wcLabel}
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 19 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.7395 0.2439C16.5045 -0.35888 15.0411 -0.05236 14.1412 0.8682L13.8741 1.14299C13.8469 1.17136 13.8469 1.21415 13.8741 1.24253L15.1397 2.54731C15.1669 2.57569 15.2104 2.57569 15.2376 2.54731L15.3663 2.41359C15.8941 1.8729 16.7193 1.8729 17.2471 2.41359C17.775 2.95428 17.775 3.83655 17.2471 4.37724L13.6045 8.11119C13.0794 8.6495 12.2607 8.6495 11.7356 8.11119L8.73852 5.04559C7.46523 3.73337 5.39773 3.73337 4.12444 5.04559L0.717222 8.54122C0.239814 9.03094 0 9.68807 0 10.3452C0 11.0023 0.239814 11.6595 0.717222 12.1492C1.92128 13.3869 3.90561 13.3869 5.10967 12.1492L8.47481 8.71356C8.502 8.68518 8.502 8.64239 8.47481 8.61401L7.2092 7.30922C7.18201 7.28085 7.13849 7.28085 7.1113 7.30922L3.78277 10.7555C3.255 11.2962 2.42981 11.2962 1.90194 10.7555C1.37407 10.2148 1.37407 9.33257 1.90194 8.79188L5.54261 5.05935C6.06949 4.51866 6.89467 4.51866 7.42254 5.05935L10.4197 8.12496C11.6918 9.43638 13.7604 9.43638 15.0325 8.12496L18.4397 4.62933C18.9171 4.13961 19.1569 3.48248 19.1569 2.82535C19.1569 2.16822 18.9171 1.51109 18.4397 1.02137C18.2357 0.808977 17.9991 0.636679 17.7395 0.518991V0.2439Z" fill="white"/>
                  </svg>
                  {wcLabel}
                </>
              )}
            </button>
          )}

          {wcMissing && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
              Enable "Connect any wallet" by setting <span className="font-mono">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</span>.
            </div>
          )}

          {/* Tx hash after send */}
          {anyTxHash && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <span className="text-green-600 dark:text-green-400 text-sm font-medium">Tx sent:</span>
              <a
                href={`${baseExplorerUrl}/tx/${anyTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-blue-600 dark:text-blue-400 underline truncate"
              >
                {anyTxHash.slice(0, 18)}...{anyTxHash.slice(-6)}
              </a>
            </div>
          )}

          {paymentDone && !anyTxHash && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300 font-medium text-center">
              Payment confirmed — your bots are active.
            </div>
          )}

          {/* Divider before manual fallback */}
          {(hasMetaMask || wcProjectId) && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
              <span>or pay manually</span>
              <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
            </div>
          )}

          {/* Manual instructions */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-3">
              Send exactly this amount of USDC on Base:
            </p>

            {/* Amount */}
            <div className="flex items-center justify-between mb-2 bg-white dark:bg-slate-700 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Amount (USDC)</p>
                <p className="font-bold text-lg text-slate-900 dark:text-white">
                  {Number(activeInvoice.amount).toFixed(6)}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(Number(activeInvoice.amount).toFixed(6), 'amount')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {copied === 'amount' ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            {/* Wallet address */}
            <div className="flex items-center justify-between mb-2 bg-white dark:bg-slate-700 rounded-lg px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">To Address (Base)</p>
                <p className="font-mono text-sm text-slate-900 dark:text-white truncate">
                  {activeInvoice.walletAddress}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(activeInvoice.walletAddress, 'address')}
                className="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
              >
                {copied === 'address' ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            {/* Payment reference */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-700 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Payment Reference</p>
                <p className="font-mono font-bold text-slate-900 dark:text-white">
                  {activeInvoice.reference}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(activeInvoice.reference, 'reference')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {copied === 'reference' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* QR Code — EIP-681 URI for ERC-20 transfer */}
          {status.usdcContract && (
            <div className="flex justify-center mt-3">
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <QRCodeSVG
                  value={`ethereum:${status.usdcContract}@${status.chainId}/transfer?address=${activeInvoice.walletAddress}&uint256=${Math.round(Number(activeInvoice.amount) * 1_000_000)}`}
                  size={140}
                  level="M"
                />
              </div>
            </div>
          )}
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-1">
            Scan with a mobile wallet (auto-fills token, amount &amp; network)
          </p>

          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mt-2">
            <p>① Make sure you&apos;re on the <strong>Base</strong> network</p>
            <p>② Send USDC (not ETH) to the address above</p>
            <p>③ After sending, payment detects automatically within ~10 seconds</p>
            <p className="text-amber-600 dark:text-amber-400">
              Expires: {new Date(activeInvoice.expiresAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Create invoice button */}
      {hasPending && !activeInvoice && (
        <button
          onClick={handleCreateInvoice}
          disabled={loading}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating Invoice...
            </>
          ) : (
            `Generate USDC Invoice · $${Number(pendingFees.totalAmount).toFixed(2)}`
          )}
        </button>
      )}

      {/* No pending fees */}
      {!hasPending && !activeInvoice && (
        <div className="text-center py-4 text-slate-500 dark:text-slate-400">
          <p className="font-medium">No pending fees</p>
          <p className="text-sm mt-1">Fees are generated from profitable trades and billed monthly</p>
        </div>
      )}

      {/* Fee summary footer */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500 dark:text-slate-400">Total Profits</p>
          <p className="font-semibold text-green-600 dark:text-green-400">
            ${Number(status.summary?.total_profits || 0).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400">Fees Paid</p>
          <p className="font-semibold text-slate-900 dark:text-white">
            ${Number(status.summary?.total_fees_collected || 0).toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
