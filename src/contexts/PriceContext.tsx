'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import type { MarketData } from '@/types/market';

interface PriceContextType {
  prices: Map<string, MarketData>;
  status: 'polling' | 'idle' | 'error' | 'stale' | 'unavailable';
  isStale: boolean;
  stalePairs: string[];
}

const PriceContext = createContext<PriceContextType | undefined>(undefined);

interface PriceProviderProps {
  children: ReactNode;
  prices: Map<string, MarketData>;
  status: 'polling' | 'idle' | 'error' | 'stale' | 'unavailable';
  isStale: boolean;
  stalePairs: string[];
}

export function PriceProvider({
  children,
  prices,
  status,
  isStale,
  stalePairs,
}: PriceProviderProps) {
  return (
    <PriceContext.Provider value={{ prices, status, isStale, stalePairs }}>
      {children}
    </PriceContext.Provider>
  );
}

export function usePriceContext() {
  const context = useContext(PriceContext);

  // Return a default context if provider is not available
  // This allows components to use the hook without requiring PriceProvider wrapper
  if (context === undefined) {
    return {
      prices: new Map<string, MarketData>(),
      status: 'unavailable' as const,
      isStale: false,
      stalePairs: [],
    };
  }

  return context;
}
