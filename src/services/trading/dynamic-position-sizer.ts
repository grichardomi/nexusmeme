/**
 * Dynamic Position Sizer
 * Auto-adjusts stake amount based on:
 * - AI confidence (higher confidence = bigger positions)
 * - Historical win rate (proven winners compound larger)
 * - Kelly Criterion (optimal position sizing for edge)
 * - Risk of ruin protection (never over-leverage)
 *
 * Ported from /nexus app which uses pyramiding profitably
 */

import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';

export interface PositioningResult {
  sizeUSD: number;
  sizeAsset: number;
  riskUSD: number;
}

export class DynamicPositionSizer {
  private accountBalance: number;
  private totalTrades: number = 0;
  private totalWins: number = 0;
  private totalLosses: number = 0;
  private avgWinPct: number;
  private avgLossPct: number;

  private readonly MIN_AI_CONFIDENCE = 50;
  private readonly MAX_AI_CONFIDENCE = 95;

  constructor(initialBalance: number) {
    this.accountBalance = initialBalance;
    const env = getEnvironmentConfig();
    this.avgWinPct = env.POSITION_SIZER_AVG_WIN_PCT;
    this.avgLossPct = env.POSITION_SIZER_AVG_LOSS_PCT;
    logger.info('DynamicPositionSizer initialized', {
      initialBalance: `$${initialBalance.toFixed(2)}`,
    });
  }

  /**
   * Update account balance (syncs with actual exchange balance)
   */
  updateBalance(newBalance: number): void {
    if (newBalance !== this.accountBalance) {
      logger.info('Account balance updated', {
        from: `$${this.accountBalance.toFixed(2)}`,
        to: `$${newBalance.toFixed(2)}`,
        change: `${((newBalance / this.accountBalance - 1) * 100).toFixed(2)}%`,
      });
      this.accountBalance = newBalance;
    }
  }

  /**
   * Get current account balance
   */
  getBalance(): number {
    return this.accountBalance;
  }

  /**
   * Update performance history from closed trades
   */
  updatePerformance(totalTrades: number, winningTrades: number, losingTrades: number, totalProfit: number, totalLoss: number): void {
    this.totalTrades = totalTrades;
    this.totalWins = winningTrades;
    this.totalLosses = losingTrades;

    if (this.totalTrades > 0) {
      // Calculate historical averages
      this.avgWinPct = this.totalWins > 0 ? totalProfit / (this.totalWins * this.accountBalance) : 0.025;
      this.avgLossPct = this.totalLosses > 0 ? totalLoss / (this.totalLosses * this.accountBalance) : 0.015;

      logger.debug('Position sizer updated with performance history', {
        totalTrades: this.totalTrades,
        winRate: `${(this.getWinRate() * 100).toFixed(1)}%`,
        avgWin: `${(this.avgWinPct * 100).toFixed(2)}%`,
        avgLoss: `${(this.avgLossPct * 100).toFixed(2)}%`,
      });
    }
  }

  /**
   * Calculate Kelly Criterion position size
   * Kelly % = (Win% × AvgWin% - Loss% × AvgLoss%) / AvgWin%
   */
  private calculateKellyFraction(): number {
    const env = getEnvironmentConfig();
    if (this.totalTrades === 0 || this.totalTrades < 10) {
      return env.POSITION_SIZER_KELLY_NO_HISTORY;
    }

    const winRate = this.getWinRate();
    const lossRate = 1 - winRate;

    // Kelly formula
    const kellyPct = (winRate * this.avgWinPct - lossRate * this.avgLossPct) / this.avgWinPct;

    // Clamp to valid range
    const safeFraction = Math.max(env.POSITION_SIZER_MIN_RISK, Math.min(env.POSITION_SIZER_MAX_RISK, kellyPct));
    const fractionalKelly = safeFraction * env.POSITION_SIZER_KELLY_FRACTION;

    logger.debug('Kelly calculation', {
      winRate: `${(winRate * 100).toFixed(1)}%`,
      kellyPct: `${(kellyPct * 100).toFixed(2)}%`,
      safeFraction: `${(safeFraction * 100).toFixed(2)}%`,
      fractionalKelly: `${(fractionalKelly * 100).toFixed(2)}%`,
    });

    return fractionalKelly;
  }

  /**
   * Get current win rate
   */
  getWinRate(): number {
    if (this.totalTrades === 0) return 0.5; // Neutral assumption
    return this.totalWins / this.totalTrades;
  }

  /**
   * Calculate dynamic position size based on:
   * - Kelly Criterion (base sizing)
   * - AI confidence (scale up/down)
   * - Account growth (compound profits)
   * - Risk of ruin (never exceed max risk)
   */
  calculateRiskPerTrade(aiConfidence: number, _stopLossPct?: number): number {
    // Base risk from Kelly
    const kellyRisk = this.calculateKellyFraction();

    // Confidence multiplier (50% AI confidence = 0.5x, 95% = 1.9x)
    const confidenceNormalized = (aiConfidence - this.MIN_AI_CONFIDENCE) /
                                  (this.MAX_AI_CONFIDENCE - this.MIN_AI_CONFIDENCE);
    const confidenceMultiplier = 0.5 + confidenceNormalized * 1.5; // Maps to 0.5x - 2.0x

    // Combined risk
    let riskPerTrade = kellyRisk * confidenceMultiplier;

    // Safety bounds
    const env = getEnvironmentConfig();
    riskPerTrade = Math.max(env.POSITION_SIZER_MIN_RISK, Math.min(env.POSITION_SIZER_MAX_RISK, riskPerTrade));

    logger.debug('Risk calculation', {
      aiConfidence,
      kellyRisk: `${(kellyRisk * 100).toFixed(2)}%`,
      confidenceMultiplier: `${confidenceMultiplier.toFixed(2)}x`,
      finalRisk: `${(riskPerTrade * 100).toFixed(2)}%`,
    });

    return riskPerTrade;
  }

  /**
   * Calculate optimal position size
   * Size = (Account Balance × Risk%) / Stop Loss %
   *
   * This is the key method for pyramiding:
   * - Position size GROWS as account balance grows
   * - Position size ADAPTS based on AI confidence
   * - Compounding happens naturally as balance increases
   */
  calculatePositionSize(
    aiConfidence: number,
    currentPrice: number,
    stopLossPct: number
  ): PositioningResult {
    const riskPerTrade = this.calculateRiskPerTrade(aiConfidence, stopLossPct);
    const riskUSD = this.accountBalance * riskPerTrade;
    // Cap position to available balance — can never invest more than we have
    const sizeUSD = Math.min(riskUSD / stopLossPct, this.accountBalance);
    const sizeAsset = sizeUSD / currentPrice;

    logger.debug('Position size calculated', {
      balance: `$${this.accountBalance.toFixed(2)}`,
      riskUSD: `$${riskUSD.toFixed(2)}`,
      sizeUSD: `$${sizeUSD.toFixed(2)}`,
      sizeAsset: sizeAsset.toFixed(8),
      confidence: `${aiConfidence}%`,
    });

    return {
      sizeUSD,
      sizeAsset,
      riskUSD,
    };
  }

  /**
   * Check if adding position would exceed max concurrent risk
   * (useful if managing multiple positions simultaneously)
   */
  canAddPosition(currentOpenRiskUSD: number, newRiskUSD: number): boolean {
    const totalRisk = currentOpenRiskUSD + newRiskUSD;
    const maxOpenRisk = this.accountBalance * 0.05; // Max 5% of account at risk

    if (totalRisk > maxOpenRisk) {
      logger.warn('Max concurrent risk exceeded', {
        currentRisk: `$${currentOpenRiskUSD.toFixed(2)}`,
        newRisk: `$${newRiskUSD.toFixed(2)}`,
        total: `$${totalRisk.toFixed(2)}`,
        max: `$${maxOpenRisk.toFixed(2)}`,
      });
      return false;
    }

    return true;
  }

  /**
   * Get position sizing summary
   */
  getSummary() {
    return {
      balance: this.accountBalance,
      winRate: this.getWinRate(),
      totalTrades: this.totalTrades,
      kellyFraction: `${(this.calculateKellyFraction() * 100).toFixed(2)}%`,
    };
  }
}

export default DynamicPositionSizer;
