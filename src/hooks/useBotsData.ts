import { useEffect, useState } from 'react';

export interface Bot {
  id: string;
  exchange: string;
  enabledPairs: string[];
  isActive: boolean;
  createdAt: string;
  totalTrades: number;
  profitLoss: number;
  initialCapital?: number; // Initial capital in USD (0 = unlimited, uses real exchange balance)
  tradingMode?: 'paper' | 'live'; // Optional: defaults to 'paper' if not specified
}

export function useBotsData() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBots() {
      try {
        const response = await fetch('/api/bots');
        if (!response.ok) {
          throw new Error('Failed to fetch bots');
        }
        const data = await response.json();
        setBots(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchBots();
  }, []);

  return { bots, isLoading, error };
}
