import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Logger } from '../utils/Logger';
import { config, TAP_BET_MANAGER_ABI } from '../config';
import type { BetScanner } from './BetScanner';

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
} as const;

export class ExpiryCleanup {
  private logger = new Logger('ExpiryCleanup');
  private account = privateKeyToAccount(config.privateKey);
  private walletClient = createWalletClient({
    account: privateKeyToAccount(config.privateKey),
    chain: MONAD_TESTNET,
    transport: http(config.rpcUrl),
  });
  private scanner: BetScanner;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(scanner: BetScanner) {
    this.scanner = scanner;
  }

  start(): void {
    this.timer = setInterval(() => this._run(), config.expiryCleanupMs);
    this.logger.info(`ExpiryCleanup started — interval ${config.expiryCleanupMs}ms`);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async _run(): Promise<void> {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const expired: bigint[] = [];

    for (const [betId, bet] of this.scanner.getActiveBets()) {
      if (now > bet.expiry) expired.push(betId);
    }

    if (!expired.length) return;

    this.logger.info(`Found ${expired.length} expired bets — settling in batches of ${config.maxBatchSize}`);

    for (let i = 0; i < expired.length; i += config.maxBatchSize) {
      const batch = expired.slice(i, i + config.maxBatchSize);
      try {
        const hash = await this.walletClient.writeContract({
          address: config.tapBetManager,
          abi: TAP_BET_MANAGER_ABI,
          functionName: 'batchSettleExpired',
          args: [batch],
          account: this.account,
        });
        this.logger.info(`batchSettleExpired tx=${hash} batch=${batch.length}`);
      } catch (err) {
        this.logger.error('batchSettleExpired failed', err);
      }
    }
  }
}
