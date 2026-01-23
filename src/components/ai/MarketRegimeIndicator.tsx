'use client';

import React from 'react';
import { MarketRegimeAnalysis } from '@/types/ai';

/**
 * Market Regime Indicator Component
 * Displays current market regime and analysis
 */

interface MarketRegimeIndicatorProps {
  regime: MarketRegimeAnalysis;
  pair: string;
}

export function MarketRegimeIndicator({
  regime,
  pair,
}: MarketRegimeIndicatorProps) {
  const regimeColors: Record<string, string> = {
    bullish: '#28a745',
    bearish: '#dc3545',
    sideways: '#ffc107',
    highly_volatile: '#dc3545',
  };

  const regimeEmoji: Record<string, string> = {
    bullish: '📈',
    bearish: '📉',
    sideways: '➡️',
    highly_volatile: '⚡',
  };

  const trendPercentage = Math.min(100, Math.max(0, regime.trend + 100) / 2);

  return (
    <div
      style={{
        backgroundColor: regimeColors[regime.regime],
        color: 'white',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
        <span style={{ fontSize: '24px' }}>{regimeEmoji[regime.regime]}</span>
        <div>
          <h2 style={{ margin: '0', fontSize: '20px' }}>
            {regime.regime.toUpperCase().replace('_', ' ')}
          </h2>
          <p style={{ margin: '0', opacity: 0.9, fontSize: '12px' }}>
            {pair} Market Regime
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
        {/* Confidence */}
        <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '4px' }}>
          <p style={{ margin: '0 0 5px 0', fontSize: '11px', opacity: 0.8 }}>CONFIDENCE</p>
          <p style={{ margin: '0', fontSize: '16px', fontWeight: 'bold' }}>
            {regime.confidence.toFixed(0)}%
          </p>
          <div
            style={{
              marginTop: '8px',
              height: '4px',
              backgroundColor: 'rgba(0,0,0,0.2)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${regime.confidence}%`,
                backgroundColor: 'rgba(255,255,255,0.8)',
              }}
            />
          </div>
        </div>

        {/* Volatility */}
        <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '4px' }}>
          <p style={{ margin: '0 0 5px 0', fontSize: '11px', opacity: 0.8 }}>VOLATILITY</p>
          <p style={{ margin: '0', fontSize: '16px', fontWeight: 'bold' }}>
            {regime.volatility.toFixed(0)}%
          </p>
          <div
            style={{
              marginTop: '8px',
              height: '4px',
              backgroundColor: 'rgba(0,0,0,0.2)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${regime.volatility}%`,
                backgroundColor: 'rgba(255,255,255,0.8)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Trend Indicator */}
      <div style={{ marginBottom: '15px' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '11px', opacity: 0.8 }}>
          TREND ({regime.trend > 0 ? '+' : ''}{regime.trend.toFixed(1)}%)
        </p>
        <div
          style={{
            height: '8px',
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${trendPercentage}%`,
              backgroundColor: regime.trend > 0 ? '#90EE90' : '#FFB6C6',
            }}
          />
        </div>
      </div>

      {/* Analysis */}
      <div
        style={{
          backgroundColor: 'rgba(0,0,0,0.2)',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px',
          lineHeight: '1.6',
        }}
      >
        {regime.analysis}
      </div>

      {/* Last Updated */}
      <p
        style={{
          margin: '12px 0 0 0',
          fontSize: '10px',
          opacity: 0.7,
          textAlign: 'right',
        }}
      >
        Updated {new Date(regime.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}
