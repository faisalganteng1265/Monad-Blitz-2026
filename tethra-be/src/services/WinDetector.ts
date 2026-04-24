import { Logger } from '../utils/Logger';
import { ActiveBet, PriceUpdate } from '../types';
import type { BetScanner } from './BetScanner';

export class WinDetector {
  private logger = new Logger('WinDetector');
  private settleQueue = new Set<bigint>();
  private scanner: BetScanner;

  constructor(scanner: BetScanner) {
    this.scanner = scanner;
  }

  onPriceUpdate(update: PriceUpdate): void {
    const now = BigInt(Math.floor(Date.now() / 1000));

    for (const [betId, bet] of this.scanner.getActiveBets()) {
      // Skip already queued
      if (this.settleQueue.has(betId)) continue;

      // Skip if expired
      if (now > bet.expiry) continue;

      // Only check bets for this symbol
      if (bet.symbolName !== update.symbol) continue;

      const won = bet.direction === 'UP'
        ? update.price >= bet.targetPrice
        : update.price <= bet.targetPrice;

      if (won) {
        this.settleQueue.add(betId);
        this.logger.info(`Win detected: betId=${betId} symbol=${update.symbol} direction=${bet.direction} target=${bet.targetPrice} price=${update.price}`);
      }
    }
  }

  drainQueue(): bigint[] {
    const ids = Array.from(this.settleQueue);
    this.settleQueue.clear();
    return ids;
  }

  queueSize(): number {
    return this.settleQueue.size;
  }
}
