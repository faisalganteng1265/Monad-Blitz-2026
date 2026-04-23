import { ethers } from 'ethers';
import { Logger } from '../utils/Logger';
import { PriceService } from './PriceService';
import { OneTapProfitService } from './OneTapProfitService';
import { OneTapBetStatus } from '../types/oneTapProfit';

const OneTapProfitABI = [
  'function settleBet(uint256 betId, uint256 currentPrice, uint256 currentTime, bool won) external',
  'event BetSettled(uint256 indexed betId, address indexed trader, uint8 status, uint256 payout, uint256 fee, uint256 settlePrice)',
  'event BatchSettled(uint256 count, address indexed settler, bytes attestation)',
  'function getBet(uint256 betId) external view returns (uint256 id, address trader, string symbol, uint256 betAmount, uint256 targetPrice, uint256 targetTime, uint256 entryPrice, uint256 entryTime, uint256 multiplier, uint8 status, uint256 settledAt, uint256 settlePrice)',
  'function privateBets(uint256) public view returns (uint256 betId, string symbol, uint256 targetTime, uint256 collateral, uint256 multiplier, bytes32 commitment, uint8 status, uint256 settledAt, uint256 settlePrice)',
];

/**
 * OneTapProfitMonitor - Automatically monitors and settles bets
 * 
 * Checks active bets every second:
 * 1. If target price reached before/at target time -> settle as WON
 * 2. If target time expired without reaching price -> settle as LOST
 */
export class OneTapProfitMonitor {
  private readonly logger = new Logger('OneTapProfitMonitor');
  private priceService: PriceService;
  private oneTapService: OneTapProfitService;
  private contract: ethers.Contract;
  private relayer: ethers.Wallet;
  private intervalId?: NodeJS.Timeout;
  private syncIntervalId?: NodeJS.Timeout;
  private isRunning = false;
  
  // Tracking for each bet
  private priceHistory: Map<string, { price: number; timestamp: number }[]> = new Map();
  
  // Previous price for each symbol to detect crossing
  private previousPrices: Map<string, number> = new Map();
  
  // Settlement queue to prevent nonce conflicts
  private isSettling = false;
  private settlementQueue: Array<{ betId: string; currentPrice: string; currentTime: number; won: boolean }> = [];
  private queuedBets: Set<string> = new Set(); // Track bets already in queue to prevent spam
  
  constructor(priceService: PriceService, oneTapService: OneTapProfitService) {
    this.priceService = priceService;
    this.oneTapService = oneTapService;
    
    // Setup relayer
    const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const relayPrivateKey = process.env.RELAY_PRIVATE_KEY;
    if (!relayPrivateKey) {
      throw new Error('RELAY_PRIVATE_KEY not set in environment');
    }
    this.relayer = new ethers.Wallet(relayPrivateKey, provider);
    
    // Setup contract
    const contractAddress = process.env.ONE_TAP_PROFIT_ADDRESS;
    if (!contractAddress) {
      throw new Error('ONE_TAP_PROFIT_ADDRESS not set in environment');
    }
    
    this.contract = new ethers.Contract(contractAddress, OneTapProfitABI, this.relayer);
    
    this.logger.info('🎯 OneTapProfitMonitor initialized');
  }
  
  /**
   * Start monitoring
   */
  start(): void {
    // OneTapProfitMonitor always runs for PUBLIC bets.
    // CRE otpSettlerWorkflow handles PRIVATE bets separately — no overlap.
    if (this.isRunning) {
      this.logger.warn('Monitor already running');
      return;
    }
    
    this.isRunning = true;
    this.logger.success('✅ OneTapProfitMonitor started! Checking bets every second...');
    this.logger.info('Using periodic settlement sync mode (no RPC event filters)');

    // Public RPCs often drop filter IDs, so use periodic chain reads instead.
    this.syncIntervalId = setInterval(() => {
      this.syncSettledBets().catch((error) => {
        this.logger.error('Error in periodic settle sync:', error);
      });
    }, 15000);
    this.syncSettledBets().catch((error) => {
      this.logger.error('Initial settle sync failed:', error);
    });

    // Check every second (same as TapToTrade check interval)
    this.intervalId = setInterval(() => {
      this.checkBets().catch((error) => {
        this.logger.error('Error checking bets:', error);
      });
    }, 1000);
  }

  /**
   * Sync all active bets from chain to see if any were settled off-monitor (like by CRE)
   */
  private async syncSettledBets(): Promise<void> {
    try {
      const activeBets = this.oneTapService.getActiveBets();
      this.logger.info(`Syncing ${activeBets.length} potentially settled bets...`);

      for (const bet of activeBets) {
        try {
          // Check privateBets mapping (since BatchSettled is for private bets)
          const onChainBet = await this.contract.privateBets(BigInt(bet.betId));
          const status = Number(onChainBet.status);
          
          if (status !== 0) { // 0 = ACTIVE
            this.oneTapService.updateBetStatus(
              bet.betId,
              this.mapStatus(status),
              ethers.formatUnits(onChainBet.settlePrice, 8),
              Number(onChainBet.settledAt)
            );
          }
        } catch (e) {
          // If not in privateBets, try getBet (public)
          try {
             const betData = await this.contract.getBet(BigInt(bet.betId));
             if (Number(betData.status) !== 0) {
               this.oneTapService.updateBetStatus(
                 bet.betId,
                 this.mapStatus(Number(betData.status)),
                 ethers.formatUnits(betData.settlePrice, 8),
                 Number(betData.settledAt)
               );
             }
          } catch {}
        }
      }
    } catch (error) {
      this.logger.error('Error syncing settled bets:', error);
    }
  }

  private mapStatus(status: number): OneTapBetStatus {
    switch (status) {
      case 0: return OneTapBetStatus.ACTIVE;
      case 1: return OneTapBetStatus.WON;
      case 2: return OneTapBetStatus.LOST;
      case 3: return OneTapBetStatus.CANCELLED;
      default: return OneTapBetStatus.ACTIVE;
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = undefined;
    }
    this.contract.removeAllListeners();
    
    this.logger.info('OneTapProfitMonitor stopped');
  }
  
  /**
   * Check all active bets
   */
  private async checkBets(): Promise<void> {
    try {
      const activeBets = this.oneTapService.getActiveBets();
      
      if (activeBets.length === 0) {
        return;
      }
      
      const now = Math.floor(Date.now() / 1000); // Unix timestamp
      const prices = this.priceService.getCurrentPrices();
      
      for (const bet of activeBets) {
        try {
          // Get current price for symbol
          const priceData = prices[bet.symbol];
          if (!priceData) {
            continue; // Skip if price not available
          }
          
          const currentPrice = priceData.price; // number from PythPriceService
          const targetPriceNum = parseFloat(bet.targetPrice);
          const entryPriceNum = parseFloat(bet.entryPrice);
          
          // Convert timestamps to GMT+7 for logging
          const toGMT7 = (timestamp: number) => {
            const date = new Date(timestamp * 1000);
            date.setHours(date.getHours() + 7);
            return date.toISOString().replace('T', ' ').substring(11, 19);
          };
          
          // Get previous price for this symbol
          // Use entryPrice as previousPrice for first check of this bet
          let previousPrice = this.previousPrices.get(bet.symbol);
          
          // Store price history
          const history = this.priceHistory.get(bet.betId) || [];
          
          // For first check of this bet, use entryPrice as previousPrice
          if (history.length === 0) {
            previousPrice = entryPriceNum;
          }
          
          history.push({ price: currentPrice, timestamp: now });
          // Keep only last 60 seconds
          const recentHistory = history.filter(h => now - h.timestamp <= 60);
          this.priceHistory.set(bet.betId, recentHistory);
          
          // Check if bet should be settled
          let shouldSettle = false;
          let won = false;
          
          // Check if price has entered grid range
          // Grid spans ±50% of GRID_Y_DOLLARS around targetPrice
          // MUST match frontend grid size exactly!
          // For SOL: GRID_Y_DOLLARS = 0.05, range = target ± 0.025
          // For others: GRID_Y_DOLLARS = 10, range = target ± 5
          const GRID_Y_DOLLARS = bet.symbol === 'SOL' ? 0.05 : 10;
          const gridHalfSize = GRID_Y_DOLLARS / 2;
          const gridMin = targetPriceNum - gridHalfSize;
          const gridMax = targetPriceNum + gridHalfSize;
          
          // Price is within grid range?
          const priceInRange = currentPrice >= gridMin && currentPrice <= gridMax;
          
          // Check if we're within the valid time window
          const inTimeWindow = now >= bet.entryTime && now <= bet.targetTime;
          
          // WIN condition: price in range AND within time window
          // No need to check "crossing" - just being in range during window = WIN
          if (priceInRange && inTimeWindow) {
            // Target reached within time window -> WON
            shouldSettle = true;
            won = true;
          } else if (now > bet.targetTime) {
            // Time expired - settle as LOST
            shouldSettle = true;
            won = false;
          }
          
          // Settle bet if needed (only if not already queued)
          if (shouldSettle && !this.queuedBets.has(bet.betId)) {
            // Log settlement decision ONCE
            if (won) {
              this.logger.success(`🎉 Bet ${bet.betId} WON!`);
              this.logger.success(`   Price: $${currentPrice.toFixed(2)} in range [$${gridMin.toFixed(2)} - $${gridMax.toFixed(2)}]`);
              this.logger.success(`   Time: ${toGMT7(now)} (valid until ${toGMT7(bet.targetTime)})`);
            } else {
              this.logger.info(`⏰ Bet ${bet.betId} LOST! Time expired`);
              this.logger.info(`   Final Price: $${currentPrice.toFixed(2)} (needed range: $${gridMin.toFixed(2)} - $${gridMax.toFixed(2)})`);
              this.logger.info(`   Expired at: ${toGMT7(now)} (limit was ${toGMT7(bet.targetTime)})`);
            }
            
            // Mark as queued to prevent duplicates
            this.queuedBets.add(bet.betId);
            
            // Add to settlement queue
            this.settlementQueue.push({
              betId: bet.betId,
              currentPrice: currentPrice.toString(),
              currentTime: now,
              won,
            });
          }
        } catch (error: any) {
          this.logger.error(`Error checking bet ${bet.betId}:`, error);
        }
      }
      
      // Update previous prices AFTER checking all bets
      // This ensures we detect crossings correctly in the next iteration
      for (const [symbol, priceData] of Object.entries(prices)) {
        if (priceData && priceData.price) {
          this.previousPrices.set(symbol, priceData.price);
        }
      }
      
      // Process settlement queue one by one
      await this.processSettlementQueue();
    } catch (error: any) {
      this.logger.error('Error in checkBets:', error);
    }
  }
  
  /**
   * Process settlement queue to avoid nonce conflicts
   */
  private async processSettlementQueue(): Promise<void> {
    // Skip if already settling or queue is empty
    if (this.isSettling || this.settlementQueue.length === 0) {
      return;
    }
    
    this.isSettling = true;
    
    try {
      // Process each settlement one by one
      while (this.settlementQueue.length > 0) {
        const settlement = this.settlementQueue.shift();
        if (!settlement) break;
        
        try {
          await this.settleBet(
            settlement.betId,
            settlement.currentPrice,
            settlement.currentTime,
            settlement.won
          );
          
          // Settlement SUCCESS - clean up
          this.priceHistory.delete(settlement.betId);
          this.queuedBets.delete(settlement.betId);
          
          // Small delay between settlements to ensure nonce increments
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error: any) {
          this.logger.error(`Failed to settle bet ${settlement.betId}:`, error);
          
          // Settlement FAILED - remove from queue so it won't spam logs
          // But keep in queuedBets to prevent re-adding to queue
          // Bet will stay ACTIVE in memory until manually fixed
          this.logger.warn(`Bet ${settlement.betId} remains ACTIVE - please fix settler role and restart`);
        }
      }
    } finally {
      this.isSettling = false;
    }
  }
  
  /**
   * Settle bet on-chain (bet already placed when user submitted)
   */
  private async settleBet(betId: string, currentPrice: string, currentTime: number, won: boolean): Promise<void> {
    try {
      // Settle bet through service (which has contract access)
      await this.oneTapService.settleBet(betId, currentPrice, currentTime, won);
    } catch (error: any) {
      this.logger.error(`Failed to settle bet ${betId}:`, error);
      throw error;
    }
  }
  
  /**
   * Check if price has CROSSED target (moved from one side to the other)
   * This is more accurate than just checking if price is at target
   */
  private hasPriceCrossedTarget(
    previousPrice: number, 
    currentPrice: number, 
    targetPrice: number, 
    entryPrice: number
  ): boolean {
    // Determine direction: UP bet = target > entry, DOWN bet = target < entry
    const isUpBet = targetPrice > entryPrice;
    
    if (isUpBet) {
      // UP bet: price crossed from below to at/above target
      // Previous was below target, current is at or above
      return previousPrice < targetPrice && currentPrice >= targetPrice;
    } else {
      // DOWN bet: price crossed from above to at/below target  
      // Previous was above target, current is at or below
      return previousPrice > targetPrice && currentPrice <= targetPrice;
    }
  }
  
  /**
   * Check if target price reached (fallback for first price check)
   * Determines direction (UP/DOWN) from entryPrice vs targetPrice
   * Uses a small threshold to account for floating point precision
   */
  private checkTargetReached(currentPrice: number, targetPrice: number, entryPrice: number): boolean {
    // Use 0.01% threshold for floating point comparison
    const threshold = targetPrice * 0.0001;
    
    // Determine direction based on target vs entry
    const isUpBet = targetPrice > entryPrice;
    
    if (isUpBet) {
      // UP bet: current price must reach or exceed target
      return currentPrice >= targetPrice - threshold;
    } else {
      // DOWN bet: current price must reach or go below target
      return currentPrice <= targetPrice + threshold;
    }
  }
  
  
  /**
   * Get monitor status
   */
  getStatus(): { isRunning: boolean; activeBets: number; monitoredPrices: number } {
    return {
      isRunning: this.isRunning,
      activeBets: this.oneTapService.getActiveBets().length,
      monitoredPrices: this.priceHistory.size,
    };
  }
}

