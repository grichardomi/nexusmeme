import { positionCalculator } from '../position-calculator';

// Mock the trading config
jest.mock('@/config/environment', () => ({
  tradingConfig: {
    krakenPyramiding: {
      levels: 3,
      multiplier: 1.5,
      initialInvestment: 100,
    },
    profitTarget: 5,
    stopLoss: 3,
  },
}));

// Mock the logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('PositionCalculator', () => {
  it('should calculate pyramid levels', () => {
    const levels = positionCalculator.calculatePyramidLevels(45000, 100);

    expect(levels.length).toBeGreaterThan(0);
    expect(levels[0].level).toBe(1);
    expect(levels[0].amount).toBe(100); // Initial investment
    expect(levels[0].priceThreshold).toBe(45000); // Entry price

    // Later levels should have higher amounts (pyramid)
    if (levels.length > 1) {
      expect(levels[1].amount).toBeGreaterThan(levels[0].amount);
    }
  });

  it('should calculate correct number of levels', () => {
    const levels = positionCalculator.calculatePyramidLevels(50000, 100);
    const config = positionCalculator.getConfig();

    expect(levels.length).toBe(config.layers);
  });

  it('should calculate exit price with default profit target', () => {
    const entryPrice = 50000;
    const exitPrice = positionCalculator.calculateExitPrice(entryPrice);

    const config = positionCalculator.getConfig();
    const expectedExit = entryPrice * (1 + config.profitTarget / 100);

    expect(exitPrice).toBeCloseTo(expectedExit, 0);
  });

  it('should calculate exit price with custom profit target', () => {
    const entryPrice = 50000;
    const customTarget = 10;
    const exitPrice = positionCalculator.calculateExitPrice(entryPrice, customTarget);

    const expectedExit = entryPrice * (1 + customTarget / 100);
    expect(exitPrice).toBeCloseTo(expectedExit, 0);
  });

  it('should calculate stop loss price', () => {
    const entryPrice = 50000;
    const stopPrice = positionCalculator.calculateStopLossPrice(entryPrice);

    const config = positionCalculator.getConfig();
    const expectedStop = entryPrice * (1 - config.stopLoss / 100);

    expect(stopPrice).toBeCloseTo(expectedStop, 0);
  });

  it('should validate trade sizes', () => {
    const config = positionCalculator.getConfig();
    const initialSize = config.initialInvestment;

    // Small trade should pass
    expect(positionCalculator.validateTradeSize(initialSize / 2, initialSize)).toBe(true);

    // Reasonable trade should pass
    expect(positionCalculator.validateTradeSize(initialSize, initialSize)).toBe(true);

    // Very large trade should fail
    expect(positionCalculator.validateTradeSize(initialSize * 3, initialSize)).toBe(false);
  });

  it('should calculate total capital needed for full pyramid', () => {
    const totalCapital = positionCalculator.calculateTotalCapitalNeeded();

    expect(totalCapital).toBeGreaterThan(0);

    const config = positionCalculator.getConfig();
    // With 3 layers and 1.5x multiplier: 100 + 150 + 225 = 475
    expect(totalCapital).toBeGreaterThan(config.initialInvestment);
  });

  it('should return configuration', () => {
    const config = positionCalculator.getConfig();

    expect(config.layers).toBeGreaterThan(0);
    expect(config.initialInvestment).toBeGreaterThan(0);
    expect(config.multiplier).toBeGreaterThan(1);
    expect(config.profitTarget).toBeGreaterThan(0);
    expect(config.stopLoss).toBeGreaterThan(0);
  });

  it('should have sensible pyramiding defaults', () => {
    const config = positionCalculator.getConfig();

    // Defaults from .env
    expect(config.layers).toBe(3);
    expect(config.initialInvestment).toBe(100);
    expect(config.multiplier).toBe(1.5);
    expect(config.profitTarget).toBe(5); // 5% profit target
    expect(config.stopLoss).toBe(3); // 3% stop loss
  });
});
