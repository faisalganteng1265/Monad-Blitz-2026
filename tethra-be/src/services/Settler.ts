import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Logger } from '../utils/Logger';
import { config, TAP_BET_MANAGER_ABI } from '../config';
import type { ActiveBet } from '../types';
import type { BetScanner } from './BetScanner';
import type { WinDetector } from './WinDetector';

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
} as const;

export class Settler {
  private logger = new Logger('Settler');
  private account = privateKeyToAccount(config.privateKey);
  private publicClient = createPublicClient({ chain: MONAD_TESTNET, transport: http(config.rpcUrl) });
  private walletClient = createWalletClient({ account: privateKeyToAccount(config.privateKey), chain: MONAD_TESTNET, transport: http(config.rpcUrl) });
  private scanner: BetScanner;
  private detector: WinDetector;
  private running = false;

  constructor(scanner: BetScanner, detector: WinDetector) {
    this.scanner = scanner;
    this.detector = detector;
  }

  start(): void {
    this.running = true;
    this._loop();
  }

  stop(): void {
    this.running = false;
  }

  private async _loop(): Promise<void> {
    while (this.running) {
      const pending = this.detector.drainQueue();
      for (const betId of pending) {
        await this._settle(betId);
      }
      await new Promise(r => setTimeout(r, 500)); // 500ms poll
    }
  }

  private async _settle(betId: bigint): Promise<void> {
    const bet = this.scanner.getActiveBets().get(betId);
    if (!bet) return; // already resolved

    try {
      const priceUpdateData = await this._fetchProof(bet);

      // Pre-simulate to catch already-settled or condition-not-met cases
      try {
        await this.publicClient.simulateContract({
          address: config.tapBetManager,
          abi: TAP_BET_MANAGER_ABI,
          functionName: 'settleBetWin',
          args: [betId, priceUpdateData],
          account: this.account,
          value: parseEther('0.001'), // enough for Pyth fee
        });
      } catch (simErr: any) {
        this.logger.warn(`Simulation failed for bet ${betId}: ${simErr?.message ?? simErr} — skipping`);
        return;
      }

      const hash = await this.walletClient.writeContract({
        address: config.tapBetManager,
        abi: TAP_BET_MANAGER_ABI,
        functionName: 'settleBetWin',
        args: [betId, priceUpdateData],
        value: parseEther('0.001'),
        account: this.account,
      });

      this.logger.info(`settleBetWin submitted: betId=${betId} tx=${hash}`);

      await this.publicClient.waitForTransactionReceipt({ hash });
      this.logger.info(`settleBetWin confirmed: betId=${betId} tx=${hash}`);

    } catch (err: any) {
      // Retry once with a fresh proof
      this.logger.warn(`Settlement failed for bet ${betId}: ${err?.message ?? err} — retrying once`);
      try {
        const freshData = await this._fetchProof(bet);
        const hash = await this.walletClient.writeContract({
          address: config.tapBetManager,
          abi: TAP_BET_MANAGER_ABI,
          functionName: 'settleBetWin',
          args: [betId, freshData],
          value: parseEther('0.001'),
          account: this.account,
        });
        await this.publicClient.waitForTransactionReceipt({ hash });
        this.logger.info(`Retry succeeded: betId=${betId} tx=${hash}`);
      } catch (retryErr) {
        this.logger.error(`Retry failed for bet ${betId} — discarding`, retryErr);
      }
    }
  }

  private async _fetchProof(bet: ActiveBet): Promise<`0x${string}`[]> {
    const priceId = this._priceIdForSymbol(bet.symbolName);
    if (!priceId) throw new Error(`No priceId for symbol ${bet.symbolName}`);

    const url = `${config.pythHermesUrl}/v2/updates/price/latest?ids[]=${priceId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Hermes fetch failed: ${res.status}`);

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
