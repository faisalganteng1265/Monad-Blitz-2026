import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { TapToTradeService } from '../services/TapToTradeService';
import { PriceService } from '../services/PriceService';
import { PriceSignerService } from '../services/PriceSignerService';
import { SessionKeyValidator } from '../services/SessionKeyValidator';
import TapToTradeExecutorABI from '../abis/TapToTradeExecutor.json';
import { Logger } from '../utils/Logger';
import {
  CreateTapToTradeOrderRequest,
  BatchCreateTapToTradeOrdersRequest,
  CancelTapToTradeOrderRequest,
  TapToTradeOrderStatus,
} from '../types/tapToTrade';

const logger = new Logger('TapToTradeRoutes');

export function createTapToTradeRoute(
  tapToTradeService: TapToTradeService,
  priceService: PriceService,
  priceSigner: PriceSignerService,
): Router {
  const router = Router();
  const sessionValidator = new SessionKeyValidator();

  const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const keeperPrivateKey = process.env.RELAY_PRIVATE_KEY;
  const tapToTradeExecutorAddress = process.env.TAP_TO_TRADE_EXECUTOR_ADDRESS || '';

  if (!keeperPrivateKey) {
    throw new Error('RELAY_PRIVATE_KEY not configured');
  }
  if (!tapToTradeExecutorAddress) {
    throw new Error('TAP_TO_TRADE_EXECUTOR_ADDRESS not configured');
  }

  const keeperWallet = new ethers.Wallet(keeperPrivateKey, provider);
  const tapToTradeExecutor = new ethers.Contract(
    tapToTradeExecutorAddress,
    TapToTradeExecutorABI.abi,
    keeperWallet,
  );

  /**
   * POST /api/tap-to-trade/create-order
   * Create a single tap-to-trade order (backend-only, not on-chain)
   */
  router.post('/create-order', async (req: Request, res: Response) => {
    try {
      const params: CreateTapToTradeOrderRequest = req.body;

      // Validation
      if (!params.trader || !params.symbol || !params.collateral) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: trader, symbol, collateral',
        });
      }

      const order = tapToTradeService.createOrder(params);

      res.json({
        success: true,
        data: order,
        message: 'Tap-to-trade order created successfully (backend-only)',
      });
    } catch (error: any) {
      logger.error('Error creating tap-to-trade order:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create tap-to-trade order',
      });
    }
  });

  /**
   * POST /api/tap-to-trade/batch-create
   * Batch create tap-to-trade orders (for grid cells)
   *
   * This endpoint is used when user clicks grid cells.
   * Orders are stored ONLY in backend (not on-chain yet).
   * Backend will execute them directly when conditions are met.
   */
  router.post('/batch-create', async (req: Request, res: Response) => {
    try {
      const params: BatchCreateTapToTradeOrdersRequest = req.body;

      // Validation
      if (!params.gridSessionId || !params.orders || params.orders.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: gridSessionId, orders',
        });
      }

      // Create all orders
      const createdOrders = tapToTradeService.batchCreateOrders(params.orders);

      logger.info(`✅ Created ${createdOrders.length} tap-to-trade orders for grid ${params.gridSessionId}`);

      res.json({
        success: true,
        data: {
          gridSessionId: params.gridSessionId,
          ordersCreated: createdOrders.length,
          orders: createdOrders,
        },
        message: `${createdOrders.length} tap-to-trade orders created successfully (backend-only)`,
      });
    } catch (error: any) {
      logger.error('Error batch creating tap-to-trade orders:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to batch create tap-to-trade orders',
      });
    }
  });

  /**
   * POST /api/tap-to-trade/execute-now
   * Execute a market-style tap order immediately (uses session key if provided)
   */
  router.post('/execute-now', async (req: Request, res: Response) => {
    try {
      const { trader, symbol, isLong, collateral, leverage, nonce, signature, sessionKey } =
        req.body ?? {};

      if (!trader || !symbol || typeof isLong !== 'boolean' || !collateral || !leverage || !nonce || !signature) {
        return res.status(400).json({
          success: false,
          error:
            'Missing required fields: trader, symbol, isLong, collateral, leverage, nonce, signature',
        });
      }

      // Validate signature (session key or user)
      if (sessionKey) {
        const validation = sessionValidator.validateOrderWithSession({
          trader,
          symbol,
          isLong,
          collateral: String(collateral),
          leverage: Number(leverage),
          nonce: String(nonce),
          signature,
          marketExecutor: tapToTradeExecutorAddress,
          sessionKey,
        });
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            error: validation.error || 'Invalid session signature',
          });
        }
      } else {
        const validation = sessionValidator.validateOrderWithoutSession({
          trader,
          symbol,
          isLong,
          collateral: String(collateral),
          leverage: Number(leverage),
          nonce: String(nonce),
          signature,
          marketExecutor: tapToTradeExecutorAddress,
        });
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            error: validation.error || 'Invalid signature',
          });
        }
      }

      const priceData = priceService.getCurrentPrice(symbol);
      if (!priceData) {
        return res.status(400).json({
          success: false,
          error: `No price available for ${symbol}`,
        });
      }

      const ageMs = Date.now() - priceData.timestamp;
      if (ageMs > 60_000) {
        return res.status(400).json({
          success: false,
          error: `Price data too old (${Math.round(ageMs / 1000)}s)`,
        });
      }

      const priceWith8Decimals = BigInt(Math.round(priceData.price * 100000000));
      const timestamp = Math.floor(Date.now() / 1000) - 60;

      if (!priceSigner.isInitialized()) {
        return res.status(500).json({
          success: false,
          error: 'Price signer not initialized',
        });
      }

      const signed = await priceSigner.signPrice(symbol, priceWith8Decimals, timestamp);

      const signedPrice = {
        symbol,
        price: BigInt(signed.price),
        timestamp: BigInt(signed.timestamp),
        signature: signed.signature,
      };

      let tx;
      if (sessionKey) {
        tx = await tapToTradeExecutor.executeTapToTradeByKeeper(
          trader,
          symbol,
          isLong,
          BigInt(collateral),
          BigInt(leverage),
          signedPrice,
          { gasLimit: 800000 },
        );
      } else {
        tx = await tapToTradeExecutor.executeTapToTrade(
          trader,
          symbol,
          isLong,
          BigInt(collateral),
          BigInt(leverage),
          signedPrice,
          signature,
          { gasLimit: 800000 },
        );
      }

      const receipt = await tx.wait();
      let positionId = '0';

      for (const log of receipt.logs) {
        try {
          const parsed = tapToTradeExecutor.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });

          if (parsed && parsed.name === 'TapToTradeOrderExecuted') {
            positionId = parsed.args.positionId.toString();
            break;
          }
        } catch {
          // ignore non-matching logs
        }
      }

      res.json({
        success: true,
        data: {
          txHash: receipt.hash,
          positionId,
          price: signed.price,
          timestamp: signed.timestamp,
        },
      });
    } catch (error: any) {
      logger.error('Error executing quick tap order:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to execute quick tap order',
      });
    }
  });

  /**
   * GET /api/tap-to-trade/order/:orderId
   * Get specific tap-to-trade order
   */
  router.get('/order/:orderId', (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;

      const order = tapToTradeService.getOrder(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      res.json({
        success: true,
        data: order,
      });
    } catch (error: any) {
      logger.error('Error fetching tap-to-trade order:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch order',
      });
    }
  });

  /**
   * GET /api/tap-to-trade/orders
   * Query tap-to-trade orders with filters
   *
   * Query params:
   * - trader: Filter by trader address
   * - gridSessionId: Filter by grid session
   * - cellId: Filter by cell
   * - status: Filter by status (PENDING, EXECUTING, EXECUTED, CANCELLED, EXPIRED, FAILED)
   */
  router.get('/orders', (req: Request, res: Response) => {
    try {
      const { trader, gridSessionId, cellId, status } = req.query;

      const orders = tapToTradeService.queryOrders({
        trader: trader as string | undefined,
        gridSessionId: gridSessionId as string | undefined,
        cellId: cellId as string | undefined,
        status: status as TapToTradeOrderStatus | undefined,
      });

      res.json({
        success: true,
        data: orders,
        count: orders.length,
      });
    } catch (error: any) {
      logger.error('Error querying tap-to-trade orders:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to query orders',
      });
    }
  });

  /**
   * GET /api/tap-to-trade/pending
   * Get all pending tap-to-trade orders (for monitoring)
   */
  router.get('/pending', (req: Request, res: Response) => {
    try {
      const orders = tapToTradeService.getPendingOrders();

      res.json({
        success: true,
        data: orders,
        count: orders.length,
      });
    } catch (error: any) {
      logger.error('Error fetching pending orders:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch pending orders',
      });
    }
  });

  /**
   * GET /api/tap-to-trade/cell/:cellId
   * Get all tap-to-trade orders for a specific grid cell
   */
  router.get('/cell/:cellId', (req: Request, res: Response) => {
    try {
      const { cellId } = req.params;

      const orders = tapToTradeService.getOrdersByCell(cellId);

      res.json({
        success: true,
        data: orders,
        count: orders.length,
      });
    } catch (error: any) {
      logger.error('Error fetching orders by cell:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch orders',
      });
    }
  });

  /**
   * POST /api/tap-to-trade/cancel-order
   * Cancel a single tap-to-trade order (backend-only, no on-chain tx)
   */
  router.post('/cancel-order', (req: Request, res: Response) => {
    try {
      const { orderId, trader }: CancelTapToTradeOrderRequest = req.body;

      if (!orderId || !trader) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: orderId, trader',
        });
      }

      tapToTradeService.cancelOrder(orderId, trader);

      res.json({
        success: true,
        message: 'Tap-to-trade order cancelled successfully (no gas fee)',
      });
    } catch (error: any) {
      logger.error('Error cancelling tap-to-trade order:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to cancel order',
      });
    }
  });

  /**
   * POST /api/tap-to-trade/cancel-cell
   * Cancel all tap-to-trade orders in a grid cell
   */
  router.post('/cancel-cell', (req: Request, res: Response) => {
    try {
      const { cellId, trader } = req.body;

      if (!cellId || !trader) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: cellId, trader',
        });
      }

      const cancelledCount = tapToTradeService.cancelOrdersByCell(cellId, trader);

      res.json({
        success: true,
        data: { cancelledCount },
        message: `${cancelledCount} tap-to-trade orders cancelled successfully (no gas fee)`,
      });
    } catch (error: any) {
      logger.error('Error cancelling cell orders:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to cancel cell orders',
      });
    }
  });

  /**
   * POST /api/tap-to-trade/cancel-grid
   * Cancel all tap-to-trade orders in a grid session
   */
  router.post('/cancel-grid', (req: Request, res: Response) => {
    try {
      const { gridSessionId, trader } = req.body;

      if (!gridSessionId || !trader) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: gridSessionId, trader',
        });
      }

      const cancelledCount = tapToTradeService.cancelOrdersByGrid(gridSessionId, trader);

      res.json({
        success: true,
        data: { cancelledCount },
        message: `${cancelledCount} tap-to-trade orders cancelled successfully (no gas fee)`,
      });
    } catch (error: any) {
      logger.error('Error cancelling grid orders:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to cancel grid orders',
      });
    }
  });

  /**
   * POST /api/tap-to-trade/update-signature
   * Update signature for an order that needs re-signing
   */
  router.post('/update-signature', (req: Request, res: Response) => {
    try {
      const { orderId, nonce, signature, trader } = req.body;

      if (!orderId || !nonce || !signature || !trader) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: orderId, nonce, signature, trader',
        });
      }

      tapToTradeService.updateSignature(orderId, nonce, signature, trader);

      res.json({
        success: true,
        message: 'Order signature updated successfully',
      });
    } catch (error: any) {
      logger.error('Error updating signature:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update signature',
      });
    }
  });

  /**
   * GET /api/tap-to-trade/stats
   * Get tap-to-trade statistics
   */
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const stats = tapToTradeService.getStats();

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

  return router;
}
