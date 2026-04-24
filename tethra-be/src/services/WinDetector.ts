import { Logger } from '../utils/Logger';
import { PriceUpdate } from '../types';
import type { BetScanner } from './BetScanner';
import type { PriceWatcher } from './PriceWatcher';

export interface WinEntry {
  betId: bigint;
  publishTime: number; // unix seconds — Pyth timestamp when win was detected
}

type OnWinCallback = (entry: WinEntry) => void;

export class WinDetector {
  private logger = new Logger('WinDetector');
  private fired = new Set<bigint>(); // bets already handed to Settler
  private scanner: BetScanner;
  private priceWatcher: PriceWatcher;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private onWinCb: OnWinCallback | null = null;

  constructor(scanner: BetScanner, priceWatcher: PriceWatcher) {
    this.scanner = scanner;
    this.priceWatcher = priceWatcher;
  }

  /** Register callback — called IMMEDIATELY when a win is detected */
  onWin(cb: OnWinCallback): void {
    this.onWinCb = cb;
  }

  start(): void {
    // Sweep every second so we never miss a win between WebSocket ticks
    this.sweepTimer = setInterval(() => this._sweep(), 1000);
    this.logger.info('WinDetector started (1s sweep + realtime price updates)');
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  onPriceUpdate(update: PriceUpdate): void {
    this._check(update.symbol, update.price, update.publishTime);
  }

  isQueued(betId: bigint): boolean {
    return this.fired.has(betId);
  }

  forceQueue(betId: bigint, publishTime?: number): void {
    if (this.fired.has(betId)) return;
    const bet = this.scanner.getActiveBets().get(betId);
    const time = publishTime ?? (bet ? Number(bet.expiry) - 1 : Math.floor(Date.now() / 1000) - 5);
    this.logger.info(`Force-queued bet ${betId} with publishTime=${time}`);
    this._fire({ betId, publishTime: time });
  }

  private _sweep(): void {
    const latest = this.priceWatcher.getLatestPrices();
    for (const [symbol, oracle] of Object.entries(latest)) {
      const price8 = BigInt(Math.round(oracle.price * 1e8));
      // Use oracle's publishTime if recent (<5s old), else use current time
      const age = Math.floor(Date.now() / 1000) - oracle.timestamp;
      const effectiveTime = age < 5 ? oracle.timestamp : Math.floor(Date.now() / 1000);
      this._check(symbol, price8, effectiveTime);
    }
  }

  private _check(symbol: string, price: bigint, publishTime: number): void {
    const now = BigInt(Math.floor(Date.now() / 1000));

    for (const [betId, bet] of this.scanner.getActiveBets()) {
      if (this.fired.has(betId)) continue;

      // Allow 30s grace past expiry to recover from price feed lag
      if (now > bet.expiry + 30n) continue;
      if (bet.symbolName !== symbol) continue;

      const won = bet.direction === 'UP'
        ? price >= bet.targetPrice
        : price <= bet.targetPrice;

      if (won) {
        // Clamp to 1s before expiry so the Pyth VAA is within the bet window
        const clampedTime = Math.min(publishTime, Number(bet.expiry) - 1);
        this.logger.info(
          `Win detected: betId=${betId} ${symbol} ${bet.direction} target=${bet.targetPrice} price=${price} publishTime=${clampedTime}`,
        );
        this._fire({ betId, publishTime: clampedTime });
      }
    }
  }

  private _fire(entry: WinEntry): void {
    this.fired.add(entry.betId);
    this.onWinCb?.(entry);
  }
}
