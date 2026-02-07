import { computeMinExitPrice } from '../../exchanges/fee-schedule';

describe('computeMinExitPrice', () => {
  it('computes a price that guarantees net >= 0 for typical taker fees', () => {
    const entryPrice = 100;
    const qty = 1;
    const entryFeeQuote = 0.2; // $0.20 entry fee
    const takerRate = 0.001; // 0.10%
    const px = computeMinExitPrice(entryPrice, entryFeeQuote, qty, takerRate, 0);
    // Net = (px-100)*1 - (0.2 + 0.001*px*1) >= 0
    // => px*(1-0.001) >= 100 + 0.2 => px >= (100.2)/(0.999) ~= 100.3003
    expect(px).toBeGreaterThanOrEqual(100.3003);
  });

  it('adds buffer correctly', () => {
    const pxNoBuffer = computeMinExitPrice(100, 0.2, 1, 0.001, 0);
    const pxWithBuffer = computeMinExitPrice(100, 0.2, 1, 0.001, 0.001); // +0.10%
    expect(pxWithBuffer).toBeCloseTo(pxNoBuffer * 1.001, 4);
  });
});

