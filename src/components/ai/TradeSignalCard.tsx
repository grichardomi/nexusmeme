'use client';

import React from 'react';
import { TradeSignalAnalysis, SignalStrength } from '@/types/ai';

/**
 * Trade Signal Card Component
 * Displays AI-generated trade signal with details
 */

interface TradeSignalCardProps {
  signal: TradeSignalAnalysis;
  pair: string;
}

export function TradeSignalCard({ signal, pair }: TradeSignalCardProps) {
  const signalColors: Record<string, string> = {
    buy: '#28a745',
    sell: '#dc3545',
    hold: '#ffc107',
  };

  const strengthBadges: Record<SignalStrength, string> = {
    strong: '⭐⭐⭐',
    moderate: '⭐⭐',
    weak: '⭐',
  };

  const confidenceColor =
    signal.confidence > 70 ? '#28a745' : signal.confidence > 50 ? '#ffc107' : '#dc3545';

  return (
    <div
      style={{
        border: `2px solid ${signalColors[signal.signal]}`,
        borderRadius: '8px',
        padding: '20px',
        backgroundColor: '#f9f9f9',
        marginBottom: '20px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div>
          <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#333' }}>
            {pair} - {signal.signal.toUpperCase()}
          </h3>
          <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
            {strengthBadges[signal.strength]} {signal.strength.charAt(0).toUpperCase() + signal.strength.slice(1)} Signal
          </p>
        </div>
        <div
          style={{
            textAlign: 'center',
            padding: '10px 15px',
            backgroundColor: confidenceColor,
            color: 'white',
            borderRadius: '4px',
            fontWeight: 'bold',
          }}
        >
          {signal.confidence}%<br />
          <span style={{ fontSize: '12px' }}>Confidence</span>
        </div>
      </div>

      {/* Price Levels */}
      <div
        style={{
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '4px',
          marginBottom: '15px',
          border: '1px solid #eee',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
          <div>
            <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666', fontWeight: 'bold' }}>
              ENTRY
            </p>
            <p style={{ margin: '0', fontSize: '16px', fontWeight: 'bold', color: '#333' }}>
              ${signal.entryPrice.toFixed(2)}
            </p>
          </div>
          <div>
            <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666', fontWeight: 'bold' }}>
              STOP LOSS
            </p>
            <p style={{ margin: '0', fontSize: '16px', fontWeight: 'bold', color: '#dc3545' }}>
              ${signal.stopLoss.toFixed(2)}
            </p>
          </div>
          <div>
            <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666', fontWeight: 'bold' }}>
              TAKE PROFIT
            </p>
            <p style={{ margin: '0', fontSize: '16px', fontWeight: 'bold', color: '#28a745' }}>
              ${signal.takeProfit.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Risk/Reward Ratio */}
      <div style={{ marginBottom: '15px' }}>
        <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666', fontWeight: 'bold' }}>
          RISK/REWARD RATIO: {signal.riskRewardRatio.toFixed(2)}:1
        </p>
        <div style={{ width: '100%', height: '6px', backgroundColor: '#eee', borderRadius: '3px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.min(signal.riskRewardRatio * 20, 100)}%`,
              backgroundColor: signal.riskRewardRatio > 2 ? '#28a745' : '#ffc107',
            }}
          />
        </div>
      </div>

      {/* Confidence Breakdown */}
      <div
        style={{
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '4px',
          marginBottom: '15px',
          border: '1px solid #eee',
        }}
      >
        <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#666', fontWeight: 'bold' }}>
          CONFIDENCE BREAKDOWN
        </p>
        <div style={{ fontSize: '13px', color: '#555' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
            <span>Technical Score:</span>
            <strong>{signal.technicalScore.toFixed(0)}%</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
            <span>Sentiment Score:</span>
            <strong>{signal.sentimentScore.toFixed(0)}%</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
            <span>Regime Score:</span>
            <strong>{signal.regimeScore.toFixed(0)}%</strong>
          </div>
        </div>
      </div>

      {/* Key Factors */}
      {signal.factors.length > 0 && (
        <div>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666', fontWeight: 'bold' }}>
            KEY FACTORS
          </p>
          <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '13px', color: '#555' }}>
            {signal.factors.map((factor, idx) => (
              <li key={idx} style={{ marginBottom: '4px' }}>
                {factor}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Analysis */}
      {signal.analysis && (
        <div
          style={{
            marginTop: '15px',
            padding: '12px',
            backgroundColor: '#f5f5f5',
            borderLeft: `3px solid ${signalColors[signal.signal]}`,
            fontSize: '13px',
            color: '#555',
            lineHeight: '1.5',
          }}
        >
          {signal.analysis}
        </div>
      )}

      {/* Expiry Time */}
      <p
        style={{
          margin: '15px 0 0 0',
          fontSize: '11px',
          color: '#999',
          textAlign: 'right',
        }}
      >
        Signal expires {new Date(signal.expiresAt).toLocaleTimeString()}
      </p>
    </div>
  );
}
