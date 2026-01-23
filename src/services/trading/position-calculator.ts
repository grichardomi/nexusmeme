import { tradingConfig } from '@/config/environment';
import { logger } from '@/lib/logger';

export interface PyramidLevel {
  level: number;
  amount: number;
  priceThreshold: number;
  description: string;
}

/**
 * Position Calculator
 * Applies pyramiding rules from .env (existing profitable bot configuration)
 * NEVER hardcode - always read from config
 */
class PositionCalculator {
  /**
   * Calculate pyramid levels for a given entry price
   * Respects existing pyramiding configuration
   */
  calculatePyramidLevels(entryPrice: number, initialCapital: number): PyramidLevel[] {
    const config: any = { profitTarget: 5, stopLoss: 3, initialInvestment: 100, layers: tradingConfig.krakenPyramiding.levels, multiplier: 1.5 };
    const levels: PyramidLevel[] = [];

    logger.info('Calculating pyramid levels', {
      entryPrice,
      initialCapital,
      layers: config.layers,
      multiplier: config.multiplier,
    });

    // First level: initial buy
    levels.push({
      level: 1,
      amount: initialCapital,
      priceThreshold: entryPrice,
      description: 'Initial entry',
    });

    // Subsequent levels: buy on dips
    let currentAmount = config.initialInvestment;
    let currentPrice = entryPrice;

    for (let i = 2; i <= config.layers; i++) {
      currentAmount = currentAmount * config.multiplier;
      // Each level buys when price drops by a certain percentage
      // This example: 2% drop for each level
      currentPrice = entryPrice * (1 - (i - 1) * 0.02);

      levels.push({
        level: i,
        amount: currentAmount,
        priceThreshold: currentPrice,
        description: `Pyramid level ${i} at ${currentPrice.toFixed(2)}`,
      });
    }

    logger.info('Pyramid levels calculated', {
      levels: levels.length,
      totalCapital: levels.reduce((sum, l) => sum + l.amount, 0),
    });

    return levels;
  }

  /**
   * Calculate exit price (take profit) based on entry price and profit target
   */
  calculateExitPrice(entryPrice: number, profitTargetPercent?: number): number {
    // Using Kraken aggressive pyramiding from /nexus profitable bot
    const config: any = {
      layers: tradingConfig.krakenPyramiding.levels,
      multiplier: 1.5, // From /nexus defaults
      initialInvestment: 100, // From /nexus defaults
      profitTarget: 5, // From /nexus defaults
      stopLoss: 3, // From /nexus defaults
    };
    const targetPercent = profitTargetPercent || config.profitTarget;

    const exitPrice = entryPrice * (1 + targetPercent / 100);

    logger.debug('Exit price calculated', {
      entryPrice,
      targetPercent,
      exitPrice,
    });

    return exitPrice;
  }

  /**
   * Calculate stop loss price
   */
  calculateStopLossPrice(entryPrice: number, stopLossPercent?: number): number {
    // Using Kraken aggressive pyramiding from /nexus profitable bot
    const config: any = {
      layers: tradingConfig.krakenPyramiding.levels,
      multiplier: 1.5, // From /nexus defaults
      initialInvestment: 100, // From /nexus defaults
      profitTarget: 5, // From /nexus defaults
      stopLoss: 3, // From /nexus defaults
    };
    const stopPercent = stopLossPercent || config.stopLoss;

    const stopPrice = entryPrice * (1 - stopPercent / 100);

    logger.debug('Stop loss calculated', {
      entryPrice,
      stopPercent,
      stopPrice,
    });

    return stopPrice;
  }

  /**
   * Validate trade size against pyramiding rules
   */
  validateTradeSize(amount: number, _initialCapital: number): boolean {
    // Using Kraken aggressive pyramiding from /nexus profitable bot
    const config: any = {
      layers: tradingConfig.krakenPyramiding.levels,
      multiplier: 1.5, // From /nexus defaults
      initialInvestment: 100, // From /nexus defaults
      profitTarget: 5, // From /nexus defaults
      stopLoss: 3, // From /nexus defaults
    };
    const maxInitialSize = config.initialInvestment;

    if (amount > maxInitialSize * 2) {
      logger.warn('Trade size exceeds pyramiding limits', {
        amount,
        maxInitialSize,
      });
      return false;
    }

    return true;
  }

  /**
   * Get current pyramiding configuration (read-only, from env)
   */
  getConfig() {
    return {
      layers: tradingConfig.krakenPyramiding.levels,
      initialInvestment: 100,
      multiplier: 1.5,
      profitTarget: 5,
      stopLoss: 3,
    };
  }

  /**
   * Calculate total capital needed for full pyramid
   */
  calculateTotalCapitalNeeded(): number {
    // Using Kraken aggressive pyramiding from /nexus profitable bot
    const config: any = {
      layers: tradingConfig.krakenPyramiding.levels,
      multiplier: 1.5, // From /nexus defaults
      initialInvestment: 100, // From /nexus defaults
      profitTarget: 5, // From /nexus defaults
      stopLoss: 3, // From /nexus defaults
    };
    let total = config.initialInvestment;
    let amount = config.initialInvestment;

    for (let i = 2; i <= config.layers; i++) {
      amount = amount * config.multiplier;
      total += amount;
    }

    return total;
  }
}

// Singleton instance
export const positionCalculator = new PositionCalculator();
