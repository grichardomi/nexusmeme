import {
  createExchangeAdapter,
  getSupportedExchanges,
  isExchangeSupported,
  ExchangeAdapterFactory,
} from '../factory';
import { KrakenAdapter } from '../kraken';
import { BinanceAdapter } from '../binance';

describe('ExchangeAdapterFactory', () => {
  it('should create Kraken adapter', () => {
    const adapter = createExchangeAdapter('kraken');
    expect(adapter).toBeInstanceOf(KrakenAdapter);
    expect(adapter.getName()).toBe('kraken');
  });

  it('should create Binance adapter', () => {
    const adapter = createExchangeAdapter('binance');
    expect(adapter).toBeInstanceOf(BinanceAdapter);
    expect(adapter.getName()).toBe('binance');
  });

  it('should be case-insensitive', () => {
    const adapter1 = createExchangeAdapter('KRAKEN');
    const adapter2 = createExchangeAdapter('Binance');

    expect(adapter1.getName()).toBe('kraken');
    expect(adapter2.getName()).toBe('binance');
  });

  it('should throw error for unsupported exchange', () => {
    expect(() => {
      createExchangeAdapter('unsupported-exchange');
    }).toThrow('Unsupported exchange');
  });

  it('should list supported exchanges', () => {
    const exchanges = getSupportedExchanges();
    expect(exchanges).toContain('kraken');
    expect(exchanges).toContain('binance');
  });

  it('should check if exchange is supported', () => {
    expect(isExchangeSupported('kraken')).toBe(true);
    expect(isExchangeSupported('BINANCE')).toBe(true);
    expect(isExchangeSupported('fake-exchange')).toBe(false);
  });

  it('should register custom adapter', () => {
    class CustomAdapter {
      getName() {
        return 'custom';
      }
      async connect() {}
      async validateConnection() {
        return true;
      }
      async placeOrder() {
        return null as any;
      }
      async cancelOrder() {}
      async getOrder() {
        return null;
      }
      async listOpenOrders() {
        return [];
      }
      async getBalance() {
        return null;
      }
      async getBalances() {
        return [];
      }
      async getTicker() {
        return null as any;
      }
      async getOHLCV() {
        return [];
      }
      async getSupportedPairs() {
        return [];
      }
      async getMinOrderSize() {
        return 10;
      }
      async getFees() {
        return { maker: 0.001, taker: 0.001 };
      }
      async getStatus() {
        return true;
      }
    }

    ExchangeAdapterFactory.register('custom', CustomAdapter as any);

    expect(isExchangeSupported('custom')).toBe(true);
    const adapter = createExchangeAdapter('custom');
    expect(adapter.getName()).toBe('custom');
  });
});
