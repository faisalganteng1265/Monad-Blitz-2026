import { Contract, ethers } from 'ethers';
import { Logger } from '../utils/Logger';
import { MultiAssetPriceData, PriceData } from '../types';
import { PriceService } from './PriceService';

type ChainlinkFeedConfig = {
  symbol: 'BTC' | 'ETH' | 'SOL';
  address: string;
};

const AGGREGATOR_V3_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function latestAnswer() view returns (int256)',
  'function latestTimestamp() view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const DEFAULT_FEEDS: ChainlinkFeedConfig[] = [
  { symbol: 'BTC', address: '0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F' },
  { symbol: 'ETH', address: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70' },
  { symbol: 'SOL', address: '0x975043adBb80fc32276CbF9Bbcfd4A601a12462D' },
];

type FeedRuntime = {
  symbol: string;
  contract: Contract;
  decimals: number;
  consecutiveFailures: number;
  disabled: boolean;
};

function normalizeSymbol(input: string): string {
  const upper = input.trim().toUpperCase();
  const cleaned = upper.replace(/[^A-Z]/g, '');
  if (cleaned.endsWith('USDT')) return cleaned.slice(0, -4);
  if (cleaned.endsWith('USD')) return cleaned.slice(0, -3);
  return cleaned;
}

export class ChainlinkPriceService implements PriceService {
  private readonly logger = new Logger('ChainlinkPriceService');
  private readonly provider: ethers.JsonRpcProvider;
  private currentPrices: MultiAssetPriceData = {};
  private priceUpdateCallbacks: ((prices: MultiAssetPriceData) => void)[] = [];
  private feeds: FeedRuntime[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;

  constructor() {
    const chainlinkRpcUrl = process.env.CHAINLINK_RPC_URL || 'https://mainnet.base.org';
    this.provider = new ethers.JsonRpcProvider(chainlinkRpcUrl);

    const configuredPoll = Number(process.env.CHAINLINK_POLL_INTERVAL_MS || '3000');
    this.pollIntervalMs = Number.isFinite(configuredPoll) && configuredPoll >= 1000
      ? configuredPoll
      : 3000;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Chainlink Price Service (Base Mainnet feeds)...');

    const configuredFeeds: FeedRuntime[] = [];

    for (const feed of DEFAULT_FEEDS) {
      const envAddress = process.env[`CHAINLINK_FEED_${feed.symbol}`];
      const finalAddress = (envAddress || feed.address).trim();

      if (!ethers.isAddress(finalAddress)) {
        this.logger.warn(`Skipping ${feed.symbol}: invalid feed address "${finalAddress}"`);
        continue;
      }

      const contract = new ethers.Contract(finalAddress, AGGREGATOR_V3_ABI, this.provider);
      let decimals = 8;
      try {
        const decimalsRaw = await contract.decimals();
        decimals = Number(decimalsRaw);
      } catch {
        this.logger.warn(`${feed.symbol}: decimals() unavailable, defaulting to 8`);
      }

      configuredFeeds.push({
        symbol: feed.symbol,
        contract,
        decimals,
        consecutiveFailures: 0,
        disabled: false,
      });
    }

    if (configuredFeeds.length === 0) {
      throw new Error('No valid Chainlink feeds configured');
    }

    this.feeds = configuredFeeds;
    this.logger.info(`Monitoring ${this.feeds.length} Chainlink feeds`);

    await this.pollAllFeeds();
    if (Object.keys(this.currentPrices).length === 0) {
      throw new Error(
        'No readable Chainlink feeds found. Check feed addresses/access or switch to Pyth mode.',
      );
    }

    this.pollTimer = setInterval(() => {
      this.pollAllFeeds().catch((error) => {
        this.logger.error('Chainlink polling error:', error);
      });
    }, this.pollIntervalMs);

    this.logger.success('Chainlink Price Service initialized successfully');
  }

  private async pollAllFeeds(): Promise<void> {
    const nextPrices: MultiAssetPriceData = { ...this.currentPrices };
    let hasUpdate = false;

    await Promise.all(
      this.feeds.map(async (feed) => {
        if (feed.disabled) return;

        try {
          const latest = await this.readLatestPrice(feed);
          if (!latest) return;

          const { answer, updatedAtMs } = latest;
          const numericPrice = Number(answer) / 10 ** feed.decimals;
          const existing = nextPrices[feed.symbol];

          if (existing && existing.timestamp === updatedAtMs && existing.price === numericPrice) {
            return;
          }

          nextPrices[feed.symbol] = {
            symbol: feed.symbol,
            price: numericPrice,
            timestamp: updatedAtMs,
            source: 'chainlink',
            publishTime: updatedAtMs,
          };

          feed.consecutiveFailures = 0;
          hasUpdate = true;
        } catch (error) {
          feed.consecutiveFailures += 1;

          if (feed.consecutiveFailures >= 1) {
            feed.disabled = true;
            this.logger.warn(
              `Disabling ${feed.symbol} Chainlink feed because reads are failing. ` +
              'Feed may require access-controlled reads on this RPC or a different feed address.',
            );
            return;
          }

          this.logger.error(`Failed to poll Chainlink feed for ${feed.symbol}:`, error);
        }
      }),
    );

    if (!hasUpdate) return;

    this.currentPrices = nextPrices;
    this.notifyPriceUpdate();
  }

  private async readLatestPrice(feed: FeedRuntime): Promise<{ answer: bigint; updatedAtMs: number } | null> {
    try {
      const latest = await feed.contract.latestRoundData();
      const answer = BigInt(latest.answer.toString());
      if (answer <= 0n) return null;

      const updatedAtSec = Number(latest.updatedAt);
      const updatedAtMs = Number.isFinite(updatedAtSec) && updatedAtSec > 0
        ? updatedAtSec * 1000
        : Date.now();

      return { answer, updatedAtMs };
    } catch {
      // Fallback for feeds exposing AggregatorV2-style methods only.
      const answerRaw = await feed.contract.latestAnswer();
      const answer = BigInt(answerRaw.toString());
      if (answer <= 0n) return null;

      let updatedAtMs = Date.now();
      try {
        const ts = Number(await feed.contract.latestTimestamp());
        if (Number.isFinite(ts) && ts > 0) {
          updatedAtMs = ts * 1000;
        }
      } catch {
        // Keep Date.now fallback when latestTimestamp is not available.
      }

      return { answer, updatedAtMs };
    }
  }

  private notifyPriceUpdate(): void {
    for (const callback of this.priceUpdateCallbacks) {
      try {
        callback(this.getCurrentPrices());
      } catch (error) {
        this.logger.error('Error in price update callback:', error);
      }
    }
  }

  getCurrentPrices(): MultiAssetPriceData {
    return { ...this.currentPrices };
  }

  getCurrentPrice(symbol: string): PriceData | null {
    const normalized = normalizeSymbol(symbol);
    return this.currentPrices[normalized] || null;
  }

  onPriceUpdate(callback: (prices: MultiAssetPriceData) => void): void {
    this.priceUpdateCallbacks.push(callback);
  }

  removePriceUpdateCallback(callback: (prices: MultiAssetPriceData) => void): void {
    const index = this.priceUpdateCallbacks.indexOf(callback);
    if (index > -1) {
      this.priceUpdateCallbacks.splice(index, 1);
    }
  }

  getHealthStatus(): { status: string; lastUpdate: number; assetsMonitored: number } {
    const prices = Object.values(this.currentPrices);
    if (prices.length === 0) {
      return {
        status: 'disconnected',
        lastUpdate: 0,
        assetsMonitored: 0,
      };
    }

    const latestUpdate = Math.max(...prices.map((price) => price.timestamp));
    const isHealthy = Date.now() - latestUpdate < 30000;

    return {
      status: isHealthy ? 'connected' : 'stale',
      lastUpdate: latestUpdate,
      assetsMonitored: prices.length,
    };
  }

  async shutdown(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.priceUpdateCallbacks = [];
    this.currentPrices = {};
    this.logger.info('Chainlink Price Service stopped');
  }
}
