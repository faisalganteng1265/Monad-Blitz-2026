import { Router, Request, Response } from 'express';
import { createPublicClient, http, isAddress } from 'viem';
import { BetScanner } from '../services/BetScanner';
import { config, TAP_BET_MANAGER_ABI, BYTES32_TO_SYMBOL } from '../config';
import { ActiveBet } from '../types';

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
} as const;

const client = createPublicClient({ chain: MONAD_TESTNET, transport: http(config.rpcUrl) });

function serializeBet(bet: ActiveBet) {
  const symbol = BYTES32_TO_SYMBOL[bet.symbol] ?? bet.symbolName;
  const entryPrice = Number(bet.targetPrice) / 1e8;
  const direction = Number(bet.targetPrice) > 0
    ? bet.direction
    : bet.direction;

  return {
    betId: bet.betId.toString(),
    trader: bet.user,
    symbol,
    direction: bet.direction,
    betAmount: (Number(bet.collateral) / 1e6).toFixed(2),
    targetPrice: bet.targetPrice.toString(),
    entryPrice: bet.targetPrice.toString(), // on-chain entryPrice not stored; use targetPrice as proxy
    entryTime: Number(bet.placedAt),
    targetTime: Number(bet.expiry),
    multiplier: Number(bet.multiplier),
    status: 'ACTIVE',
  };
}

export function createBetsRouter(scanner: BetScanner): Router {
  const router = Router();

  // GET /api/one-tap/active?trader=0x... — active bets (optionally filtered by trader)
  router.get('/active', (req: Request, res: Response) => {
    const { trader } = req.query;
    const syncing = scanner.isSyncing();
    let bets = Array.from(scanner.getActiveBets().values());
    if (trader && typeof trader === 'string' && isAddress(trader)) {
      bets = bets.filter(b => b.user.toLowerCase() === trader.toLowerCase());
    }
    res.json({ success: true, data: bets.map(serializeBet), ...(syncing && { syncing: true }) });
  });

  // GET /api/one-tap/bets?trader=0x... — all bets for a specific trader (on-chain)
  router.get('/bets', async (req: Request, res: Response) => {
    const { trader } = req.query;

    if (!trader || typeof trader !== 'string') {
      res.status(400).json({ success: false, error: 'trader address required' });
      return;
    }

    if (!isAddress(trader)) {
      res.status(400).json({ success: false, error: 'invalid trader address' });
      return;
    }

    try {
      // Get BetPlaced logs filtered by trader (indexed topic)
      const logs = await client.getLogs({
        address: config.tapBetManager,
        event: TAP_BET_MANAGER_ABI.find(x => x.type === 'event' && x.name === 'BetPlaced') as any,
        args: { user: trader as `0x${string}` },
        fromBlock: 0n,
        toBlock: 'latest',
      });

      if (logs.length === 0) {
        res.json({ success: true, data: [] });
        return;
      }

      // Fetch current status for each bet
      const betIds = logs.map((l: any) => l.args.betId as bigint);
      const bets = await Promise.all(
        betIds.map(async (betId) => {
          try {
            const raw = await client.readContract({
              address: config.tapBetManager,
              abi: TAP_BET_MANAGER_ABI,
              functionName: 'getBet',
              args: [betId],
            }) as any;

            const statusMap: Record<number, string> = { 0: 'ACTIVE', 1: 'WON', 2: 'EXPIRED' };
            const symbolName = BYTES32_TO_SYMBOL[raw.symbol] ?? raw.symbol;
            const direction = Number(raw.targetPrice) >= 0 ? (raw.direction === 0 ? 'UP' : 'DOWN') : 'UP';

            return {
              betId: raw.betId.toString(),
              trader: raw.user,
              symbol: symbolName,
              direction,
              betAmount: (Number(raw.collateral) / 1e6).toFixed(2),
              targetPrice: raw.targetPrice.toString(),
              entryPrice: raw.targetPrice.toString(),
              entryTime: Number(raw.placedAt),
              targetTime: Number(raw.expiry),
              multiplier: Number(raw.multiplier),
              status: statusMap[raw.status] ?? 'ACTIVE',
            };
          } catch {
            return null;
          }
        }),
      );

      res.json({ success: true, data: bets.filter(Boolean) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? 'Internal error' });
    }
  });

  return router;
}
