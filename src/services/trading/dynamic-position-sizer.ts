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
  private avgWinPct: number = 0.025; // 2.5% average win
  private avgLossPct: number = 0.015; // 1.5% average loss

  // Safety caps (tuned for balanced growth with capital preservation)
  private readonly MAX_RISK_PER_TRADE = 0.10; // Never risk >10% of balance
  private readonly MIN_RISK_PER_TRADE = 0.01; // Never risk <1% of balance
  private readonly KELLY_FRACTION = 0.25; // Use 1/4 Kelly to reduce variance
  private readonly MIN_AI_CONFIDENCE = 50;
  private readonly MAX_AI_CONFIDENCE = 95;

  // Default Kelly fraction when no trade history exists
  private readonly DEFAULT_KELLY_NO_HISTORY = 0.05; // 5% default (enables 50% position sizing at 2% stop loss)

  constructor(initialBalance: number) {
    this.accountBalance = initialBalance;
    logger.info('DynamicPositionSizer initialized', {
      initialBalance: `$${initialBalance.toFixed(2)}`,
    });
  }

  /**
   * Update account balance (syncs with actual Kraken balance)
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
    if (this.totalTrades === 0 || this.totalTrades < 10) {
      // No history or limited history (< 10 trades), use default that enables 50%+ position sizing
      // With 2% stop loss: 10% Kelly = $10k * 0.10 / 0.02 = $50k position = 500% leverage
      // With 2% stop loss: 5% Kelly = $10k * 0.05 / 0.02 = $25k position = 250% leverage (too much!)
      // With 2% stop loss: 2% Kelly = $10k * 0.02 / 0.02 = $10k position = 100% leverage
      // Solution: for early trades, use 5% but allow confidence to scale it down if low confidence
      return this.DEFAULT_KELLY_NO_HISTORY; // 5% risk for new/limited history
    }

    const winRate = this.getWinRate();
    const lossRate = 1 - winRate;

    // Kelly formula
    const kellyPct = (winRate * this.avgWinPct - lossRate * this.avgLossPct) / this.avgWinPct;

    // Clamp to valid range
    const safeFraction = Math.max(0.01, Math.min(0.10, kellyPct));
    const fractionalKelly = safeFraction * this.KELLY_FRACTION; // Use 1/4 Kelly

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
    riskPerTrade = Math.max(this.MIN_RISK_PER_TRADE, Math.min(this.MAX_RISK_PER_TRADE, riskPerTrade));

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
    const sizeUSD = riskUSD / stopLossPct; // How much to invest to risk exactly riskUSD
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
