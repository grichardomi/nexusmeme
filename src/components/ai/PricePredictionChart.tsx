'use client';

import React from 'react';
import { PricePrediction } from '@/types/ai';

/**
 * Price Prediction Chart Component
 * Displays predicted price levels for different timeframes
 */

interface PricePredictionChartProps {
  prediction: PricePrediction;
  pair: string;
}

export function PricePredictionChart({
  prediction,
  pair,
}: PricePredictionChartProps) {
  const allPrices = [
    prediction.currentPrice,
    prediction.shortTerm.price,
    prediction.mediumTerm.price,
    prediction.longTerm.price,
    ...prediction.keyLevels.support,
    ...prediction.keyLevels.resistance,
  ];

  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice;

  const getYPosition = (price: number): number => {
    return ((maxPrice - price) / priceRange) * 100;
  };

  const predictions = [
    {
      label: 'Current',
      price: prediction.currentPrice,
      timeframe: 'Now',
      color: '#667eea',
      probability: 100,
    },
    {
      label: 'Short Term',
      price: prediction.shortTerm.price,
      timeframe: prediction.shortTerm.timeframe,
      color: '#28a745',
      probability: prediction.shortTerm.probability,
    },
    {
      label: 'Medium Term',
      price: prediction.mediumTerm.price,
      timeframe: prediction.mediumTerm.timeframe,
      color: '#ffc107',
      probability: prediction.mediumTerm.probability,
    },
    {
      label: 'Long Term',
      price: prediction.longTerm.price,
      timeframe: prediction.longTerm.timeframe,
      color: '#667eea',
      probability: prediction.longTerm.probability,
    },
  ];

  const changePercent = (
    ((prediction.currentPrice - prediction.longTerm.price) /
      prediction.currentPrice) *
    100
  ).toFixed(2);

  return (
    <div
      style={{
        backgroundColor: '#f9f9f9',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        border: '1px solid #eee',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '15px' }}>
        <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', color: '#333' }}>
          Price Predictions - {pair}
        </h3>
        <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
          4-week outlook with {prediction.confidence}% confidence
        </p>
      </div>

      {/* Chart */}
      <div
        style={{
          position: 'relative',
          height: '200px',
          backgroundColor: 'white',
          border: '1px solid #eee',
          borderRadius: '4px',
          padding: '10px',
          marginBottom: '15px',
        }}
      >
        {/* Y-axis labels */}
        <div
          style={{
            position: 'absolute',
            left: '0',
            top: '0',
            bottom: '0',
            width: '60px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontSize: '10px',
            color: '#999',
            textAlign: 'right',
            paddingRight: '10px',
          }}
        >
          <span>${maxPrice.toFixed(0)}</span>
          <span>${((minPrice + maxPrice) / 2).toFixed(0)}</span>
          <span>${minPrice.toFixed(0)}</span>
        </div>

        {/* Support/Resistance zones */}
        {prediction.keyLevels.support.map((support, idx) => (
          <div
            key={`support-${idx}`}
            style={{
              position: 'absolute',
              left: '60px',
              right: '0',
              height: '1px',
              backgroundColor: '#28a74520',
              top: `${getYPosition(support)}%`,
            }}
          />
        ))}

        {prediction.keyLevels.resistance.map((resistance, idx) => (
          <div
            key={`resistance-${idx}`}
            style={{
              position: 'absolute',
              left: '60px',
              right: '0',
              height: '1px',
              backgroundColor: '#dc354520',
              top: `${getYPosition(resistance)}%`,
            }}
          />
        ))}

        {/* Price points */}
        {predictions.map((pred, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: `${60 + (idx / (predictions.length - 1)) * (100 - 120)}%`,
              top: `${getYPosition(pred.price)}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: pred.color,
                borderRadius: '50%',
                border: '2px solid white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            />
          </div>
        ))}
      </div>

      {/* Price Levels Table */}
      <div style={{ marginBottom: '15px' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
          }}
        >
          <tbody>
            {predictions.map((pred, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: idx < predictions.length - 1 ? '1px solid #eee' : 'none',
                }}
              >
                <td style={{ padding: '10px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        backgroundColor: pred.color,
                        borderRadius: '50%',
                      }}
                    />
                    <strong>{pred.label}</strong>
                  </div>
                </td>
                <td style={{ padding: '10px 0', textAlign: 'right' }}>
                  <strong>${pred.price.toFixed(2)}</strong>
                </td>
                <td style={{ padding: '10px 0', color: '#666', textAlign: 'right' }}>
                  {pred.timeframe}
                </td>
                <td style={{ padding: '10px 0 10px 10px', textAlign: 'right' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      backgroundColor: '#f0f0f0',
                      padding: '2px 8px',
                      borderRadius: '3px',
                      color: '#666',
                    }}
                  >
                    {pred.probability}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Direction */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px',
          backgroundColor:
            prediction.direction === 'up' ? '#d4edda' : '#f8d7da',
          borderRadius: '4px',
        }}
      >
        <span style={{ fontSize: '20px' }}>
          {prediction.direction === 'up' ? '📈' : '📉'}
        </span>
        <div>
          <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
            Expected direction:{' '}
            <strong style={{ color: prediction.direction === 'up' ? '#28a745' : '#dc3545' }}>
              {prediction.direction.toUpperCase()}
            </strong>
          </p>
          <p
            style={{
              margin: '0',
              fontSize: '11px',
              color: '#666',
            }}
          >
            {Math.abs(parseFloat(changePercent))}% change expected
          </p>
        </div>
      </div>

      {/* Analysis */}
      {prediction.analysis && (
        <div
          style={{
            marginTop: '15px',
            padding: '12px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#555',
            lineHeight: '1.5',
          }}
        >
          <strong>Analysis:</strong> {prediction.analysis}
        </div>
      )}

      {/* Last Updated */}
      <p
        style={{
          margin: '12px 0 0 0',
          fontSize: '10px',
          color: '#999',
          textAlign: 'right',
        }}
      >
        Generated {new Date(prediction.timestamp).toLocaleString()}
      </p>
    </div>
  );
}
