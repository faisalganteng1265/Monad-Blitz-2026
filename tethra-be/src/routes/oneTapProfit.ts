import { Router, Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { OneTapProfitService } from '../services/OneTapProfitService';
import { OneTapProfitMonitor } from '../services/OneTapProfitMonitor';
import { Logger } from '../utils/Logger';
import {
  PlaceOneTapBetRequest,
  GetOneTapBetsQuery,
  CalculateMultiplierRequest,
  OneTapBetStatus,
} from '../types/oneTapProfit';

const logger = new Logger('OneTapProfitRoutes');

export function createOneTapProfitRoute(
  oneTapService: OneTapProfitService,
  oneTapMonitor: OneTapProfitMonitor
): Router {
  const router = Router();

  /**
   * POST /api/one-tap/place-bet
   * Place a new bet (gasless via relayer) - Legacy method with user signature
   */
  router.post('/place-bet', async (req: Request, res: Response) => {
    try {
      const params: PlaceOneTapBetRequest = req.body;

      // Validation
      if (!params.trader || !params.symbol || !params.betAmount || !params.targetPrice) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: trader, symbol, betAmount, targetPrice, targetTime, entryPrice, entryTime, nonce, userSignature',
        });
      }

      const result = await oneTapService.placeBet(params);

      res.json({
        success: true,
        data: result,
        message: 'Bet placed successfully (gasless transaction)',
      });
    } catch (error: any) {
      logger.error('Error placing bet:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to place bet',
      });
    }
  });

  /**
   * POST /api/one-tap/place-bet-with-session
   * Place bet via keeper with session key (fully gasless)
   */
  router.post('/place-bet-with-session', async (req: Request, res: Response) => {
    try {
      const { trader, symbol, betAmount, targetPrice, targetTime, entryPrice, entryTime, sessionSignature } = req.body;

      // Validation
      if (!trader || !symbol || !betAmount || !targetPrice || !sessionSignature) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: trader, symbol, betAmount, targetPrice, targetTime, entryPrice, entryTime, sessionSignature',
        });
      }

      // For OneTapProfit, we trust the session signature was validated by frontend
      // Backend just executes via keeper (off-chain validation is sufficient)
      logger.info(`🎯 Placing OneTapProfit bet via keeper for trader ${trader}`);
      logger.info(`   Session signature provided, executing gaslessly...`);

      // Execute via keeper (no signature verification on-chain)
      const result = await oneTapService.placeBetByKeeper({
        trader,
        symbol,
        betAmount,
        targetPrice,
        targetTime,
        entryPrice,
        entryTime,
      });

      res.json({
        success: true,
        data: result,
        message: 'Bet placed successfully via keeper (fully gasless!)',
      });
    } catch (error: any) {
      logger.error('Error placing bet with session:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to place bet',
      });
    }
  });

  /**
   * GET /api/one-tap/bet/:betId
   * Get specific bet details
   */
  router.get('/bet/:betId', async (req: Request, res: Response) => {
    try {
      const { betId } = req.params;

      const bet = await oneTapService.getBet(betId);
      if (!bet) {
        return res.status(404).json({
          success: false,
          error: 'Bet not found',
        });
      }

      res.json({
        success: true,
        data: bet,
      });
    } catch (error: any) {
      logger.error('Error fetching bet:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch bet',
      });
    }
  });

  /**
   * GET /api/one-tap/bets
   * Query bets with filters
   * 
   * Query params:
   * - trader: Filter by trader address
   * - symbol: Filter by symbol (BTC, ETH, etc)
   * - status: Filter by status (ACTIVE, WON, LOST, CANCELLED)
   */
  router.get('/bets', async (req: Request, res: Response) => {
    try {
      const { trader, symbol, status } = req.query;

      const bets = await oneTapService.queryBets({
        trader: trader as string | undefined,
        symbol: symbol as string | undefined,
        status: status as OneTapBetStatus | undefined,
      });

      res.json({
        success: true,
        data: bets,
        count: bets.length,
      });
    } catch (error: any) {
      logger.error('Error querying bets:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to query bets',
      });
    }
  });

  /**
   * GET /api/one-tap/active
   * Get all active bets (being monitored)
   */
  router.get('/active', (req: Request, res: Response) => {
    try {
      const bets = oneTapService.getActiveBets();

      res.json({
        success: true,
        data: bets,
        count: bets.length,
      });
    } catch (error: any) {
      logger.error('Error fetching active bets:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch active bets',
      });
    }
  });

  /**
   * POST /api/one-tap/calculate-multiplier
   * Calculate multiplier for given parameters
   */
  router.post('/calculate-multiplier', async (req: Request, res: Response) => {
    try {
      const params: CalculateMultiplierRequest = req.body;

      // Validation
      if (!params.entryPrice || !params.targetPrice || !params.entryTime || !params.targetTime) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: entryPrice, targetPrice, entryTime, targetTime',
        });
      }

      const result = await oneTapService.calculateMultiplier(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error calculating multiplier:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to calculate multiplier',
      });
    }
  });

  /**
   * GET /api/one-tap/stats
   * Get One Tap Profit statistics
   */
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const stats = oneTapService.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch stats',
      });
    }
  });

  /**
   * GET /api/one-tap/status
   * Get monitor status
   */
  router.get('/status', (req: Request, res: Response) => {
    try {
      const status = oneTapMonitor.getStatus();
      const contractAddress = oneTapService.getContractAddress();

      res.json({
        success: true,
        data: {
          ...status,
          contractAddress,
        },
      });
    } catch (error: any) {
      logger.error('Error fetching status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch status',
      });
    }
  });

  // ============================================================
  // PRIVATE BET — Chainlink CRE Integration
  // ============================================================

  const encryptedBetStore = new Map<string, string>();
  const relayBalances = new Map<string, number>(); // trader → USDC balance on relay

  function authenticateCRERequest(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const expectedKey = process.env.CRE_BACKEND_API_KEY;

    if (!expectedKey) {
      return res.status(500).json({ error: 'CRE API key not configured' });
    }
    if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  function getDenomination(betAmount: number): number {
    if (betAmount <= 20) return 5;
    if (betAmount <= 100) return 10;
    if (betAmount <= 500) return 50;
    return 100;
  }

  /**
   * POST /api/one-tap/deposit-relay
   * Register a USDC deposit to relay wallet. Frontend transfers USDC first, then calls this.
   */
  router.post('/deposit-relay', async (req: Request, res: Response) => {
    try {
      const { trader, amount } = req.body;
      if (!trader || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Missing trader or invalid amount' });
      }

      const current = relayBalances.get(trader.toLowerCase()) || 0;
      relayBalances.set(trader.toLowerCase(), current + amount);

      const depositLogger = new Logger('PrivateBet');
      depositLogger.info(`Relay deposit: ${trader} += ${amount} USDC (total: ${current + amount})`);

      res.json({ balance: current + amount });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/one-tap/relay-balance/:trader
   * Check relay balance for a trader.
   */
  router.get('/relay-balance/:trader', async (req: Request, res: Response) => {
    const balance = relayBalances.get(req.params.trader.toLowerCase()) || 0;
    res.json({ balance });
  });

  /**
   * POST /api/one-tap/place-bet-private
   * Place private bet — USDC already deposited to relay wallet upfront.
   * Backend deducts from relay balance, splits into denominations, submits to contract.
   */
  router.post('/place-bet-private', async (req: Request, res: Response) => {
    try {
      const {
        trader,
        symbol,
        targetTime,
        betAmount,
        targetPrice,
        isUp,
        entryPrice,
        entryTime,
        commitment,
        encrypted,
      } = req.body;

      const missing: string[] = [];
      if (!trader) missing.push('trader');
      if (!symbol) missing.push('symbol');
      if (targetTime == null) missing.push('targetTime');
      if (!betAmount && betAmount !== 0) missing.push('betAmount');
      if (!targetPrice) missing.push('targetPrice');
      if (!commitment) missing.push('commitment');
      if (!encrypted) missing.push('encrypted');
      if (missing.length > 0) {
        logger.error(`place-bet-private missing fields: ${missing.join(', ')}`, req.body);
        return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
      }

      // Snap to valid denomination (contract requires 5, 10, 50, or 100)
      const denom = betAmount <= 5 ? 5 : betAmount <= 10 ? 10 : betAmount <= 50 ? 50 : 100;

      // Check relay balance
      const traderKey = trader.toLowerCase();
      const relayBal = relayBalances.get(traderKey) || 0;
      if (relayBal < denom) {
        return res.status(400).json({
          error: `Insufficient relay balance: ${relayBal} USDC (need ${denom}). Deposit first.`,
        });
      }

      const multiplier = oneTapService.calculateMultiplierLocal(
        entryPrice, targetPrice, entryTime, targetTime
      );

      const privateLogger = new Logger('PrivateBet');
      privateLogger.info(`Placing private bet: ${symbol} ${denom} USDC (multiplier: ${multiplier})`);

      const contract = oneTapService.getContract();

      const tx = await contract.placeBetPrivate(
        commitment,
        symbol,
        targetTime,
        ethers.parseUnits(String(denom), 6),
        multiplier
      );
      const receipt = await tx.wait();

      // Parse betId from PrivateBetPlaced event
      const iface = contract.interface;
      const privateBetEvent = receipt.logs
        .map((log: any) => { try { return iface.parseLog(log); } catch { return null; } })
        .find((parsed: any) => parsed?.name === 'PrivateBetPlaced');

      const betId = privateBetEvent?.args?.[0]?.toString() ?? '0';

      encryptedBetStore.set(betId, encrypted);

      // Add to service memory for status tracking (so frontend sees it)
      oneTapService.addBet({
        betId,
        trader: trader.toLowerCase(),
        symbol,
        betAmount: String(denom),
        targetPrice: String(targetPrice),
        targetTime: Number(targetTime),
        entryPrice: String(entryPrice),
        entryTime: Number(entryTime),
        multiplier,
        status: OneTapBetStatus.ACTIVE,
        createdAt: Date.now(),
      });

      // Deduct relay balance
      relayBalances.set(traderKey, relayBal - denom);
      privateLogger.info(`Private bet placed: betId=${betId}, relay balance: ${relayBal - denom} USDC`);

      res.json({ betId, multiplier, relayBalance: relayBal - denom });
    } catch (error: any) {
      const privateLogger = new Logger('PrivateBet');
      privateLogger.error('Failed to place private bet:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/one-tap/withdraw-relay
   * Withdraw remaining USDC from relay back to user's wallet.
   */
  router.post('/withdraw-relay', async (req: Request, res: Response) => {
    try {
      const { trader } = req.body;
      if (!trader) {
        return res.status(400).json({ error: 'Missing trader address' });
      }

      const traderKey = trader.toLowerCase();
      const balance = relayBalances.get(traderKey) || 0;
      if (balance <= 0) {
        return res.json({ amount: 0, message: 'No balance to withdraw' });
      }

      // Send USDC from relay wallet back to user
      const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const relayWallet = new ethers.Wallet(process.env.RELAY_PRIVATE_KEY!, provider);

      const usdcAddress = process.env.USDC_TOKEN_ADDRESS;
      const usdcContract = new ethers.Contract(
        usdcAddress!,
        ['function transfer(address to, uint256 amount) returns (bool)'],
        relayWallet,
      );

      const tx = await usdcContract.transfer(trader, ethers.parseUnits(String(balance), 6));
      await tx.wait();

      relayBalances.set(traderKey, 0);

      const withdrawLogger = new Logger('PrivateBet');
      withdrawLogger.info(`Withdraw: ${trader} got ${balance} USDC back`);

      res.json({ amount: balance, txHash: tx.hash });
    } catch (error: any) {
      const withdrawLogger = new Logger('PrivateBet');
      withdrawLogger.error('Failed to withdraw:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/one-tap/cre-settle
   * CRE workflow sends computed settlement data here.
   * Backend relays it on-chain by calling settleBetBatch().
   * Authenticated via CRE API key.
   */
  router.post('/cre-settle', authenticateCRERequest, async (req: Request, res: Response) => {
    try {
      const { betIds, traders, settlePrices, wonArr } = req.body;

      if (!betIds?.length || !traders?.length || !settlePrices?.length || !wonArr?.length) {
        return res.status(400).json({ error: 'Missing required arrays: betIds, traders, settlePrices, wonArr' });
      }
      if (betIds.length !== traders.length || betIds.length !== settlePrices.length || betIds.length !== wonArr.length) {
        return res.status(400).json({ error: 'Array length mismatch' });
      }

      const settleLogger = new Logger('CRESettle');
      settleLogger.info(`CRE settlement relay: ${betIds.length} bets`);

      const contract = oneTapService.getContract();
      const tx = await contract.settleBetBatch(
        betIds.map((id: number) => BigInt(id)),
        traders,
        settlePrices.map((p: string) => BigInt(p)),
        wonArr,
        '0x'
      );
      const receipt = await tx.wait();

      settleLogger.info(`Settlement tx: ${receipt.hash}`);

      res.json({
        success: true,
        txHash: receipt.hash,
        settled: betIds.length,
      });
    } catch (error: any) {
      const settleLogger = new Logger('CRESettle');
      settleLogger.error('CRE settlement relay failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/one-tap/private-bet-encrypted/:betId
   * CRE fetches encrypted bet data for settlement.
   * Authenticated via API key (local: .env, prod: Vault DON).
   */
  router.get('/private-bet-encrypted/:betId', authenticateCRERequest, async (req: Request, res: Response) => {
    try {
      const betId = req.params.betId;
      const encrypted = encryptedBetStore.get(betId);

      if (!encrypted) {
        return res.status(404).json({ error: 'Encrypted bet data not found' });
      }

      res.json({ encrypted });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
