import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Logger } from '../utils/Logger';
import { config, TAP_BET_MANAGER_ABI } from '../config';
import type { ActiveBet } from '../types';
import type { BetScanner } from './BetScanner';
import type { WinEntry } from './WinDetector';

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
} as const;

export class Settler {
  private logger = new Logger('Settler');
  private account = privateKeyToAccount(config.privateKey);
  private walletClient = createWalletClient({
    account: privateKeyToAccount(config.privateKey),
    chain: MONAD_TESTNET,
    transport: http(config.rpcUrl),
  });
  private scanner: BetScanner;
  private inFlight = new Set<bigint>(); // prevent duplicate settlement attempts

  constructor(scanner: BetScanner) {
    this.scanner = scanner;
  }

  start(): void {
    this.logger.info('Settler ready — immediate settlement on win detection');
  }

  stop(): void {}

  /**
   * Called immediately when WinDetector detects a win.
   * Fires settlement without simulation delay.
   */
  settle(entry: WinEntry): void {
    if (this.inFlight.has(entry.betId)) return;
    this.inFlight.add(entry.betId);
    this._settle(entry).finally(() => this.inFlight.delete(entry.betId));
  }

  private async _settle(entry: WinEntry): Promise<void> {
    const { betId, publishTime } = entry;
    const bet = this.scanner.getActiveBets().get(betId);
    if (!bet) {
      this.logger.warn(`Bet ${betId} not in active map — skipping`);
      return;
    }

    this.logger.info(`Settling win: betId=${betId} ${bet.symbolName} ${bet.direction} publishTime=${publishTime}`);

    let priceUpdateData: `0x${string}`[];
    try {
      priceUpdateData = await this._fetchProof(bet);
    } catch (err: any) {
      this.logger.error(`Failed to fetch Pyth proof for bet ${betId}: ${err?.message}`, err);
      return;
    }

    try {
      const hash = await this.walletClient.writeContract({
        address: config.tapBetManager,
        abi: TAP_BET_MANAGER_ABI,
        functionName: 'settleBetWin',
        args: [betId, priceUpdateData],
        value: parseEther('0.001'),
        account: this.account,
      });
      this.logger.info(`settleBetWin submitted: betId=${betId} tx=${hash}`);
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);

      // Bet already settled on-chain — remove from scanner so ExpiryCleanup stops retrying
      if (msg.includes('bet expired') || msg.includes('already settled') || msg.includes('not active')) {
        this.logger.warn(`Bet ${betId} already settled on-chain — removing from active map`);
        this.scanner.removeBet(betId);
        return;
      }

      // Transient error — retry once with fresh proof
      this.logger.warn(`Settlement failed for bet ${betId}: ${msg} — retrying with fresh proof`);
      try {
        const freshProof = await this._fetchProof(bet);
        const hash = await this.walletClient.writeContract({
          address: config.tapBetManager,
          abi: TAP_BET_MANAGER_ABI,
          functionName: 'settleBetWin',
          args: [betId, freshProof],
          value: parseEther('0.001'),
          account: this.account,
        });
        this.logger.info(`Retry succeeded: betId=${betId} tx=${hash}`);
      } catch (retryErr: any) {
        const retryMsg: string = retryErr?.message ?? String(retryErr);
        if (retryMsg.includes('bet expired') || retryMsg.includes('already settled') || retryMsg.includes('not active')) {
          this.scanner.removeBet(betId);
        }
        this.logger.error(`Retry failed for bet ${betId}: ${retryMsg}`);
      }
    }
  }

  private async _fetchProof(bet: ActiveBet): Promise<`0x${string}`[]> {
    const priceId = this._priceIdForSymbol(bet.symbolName);
    if (!priceId) throw new Error(`No priceId for symbol ${bet.symbolName}`);

    // Always use latest proof — PriceAdapter reads price directly from VAA bytes
    const url = `${config.pythHermesUrl}/v2/updates/price/latest?ids[]=${priceId}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new Error(`Hermes fetch failed: ${res.status} for ${url}`);

    const data = await res.json() as any;
    const vaas: string[] = data.binary?.data ?? [];
    if (!vaas.length) throw new Error('No VAA data from Hermes');

    return vaas.map(v => (v.startsWith('0x') ? v : `0x${v}`) as `0x${string}`);
  }

  private _priceIdForSymbol(symbol: string): string | undefined {
    const map: Record<string, string> = {
      BTC: config.pythBtcPriceId,
      ETH: config.pythEthPriceId,
      MON: config.pythMonPriceId,
    };
    return map[symbol];
  }
}
