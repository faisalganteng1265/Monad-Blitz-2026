import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as WebSocketServer } from 'ws';
import http from 'http';
import { PythPriceService } from './services/PythPriceService';
import { ChainlinkPriceService } from './services/ChainlinkPriceService';
import { PriceService } from './services/PriceService';
import { PriceSignerService } from './services/PriceSignerService';
import { RelayService } from './services/RelayService';
import { OneTapProfitService } from './services/OneTapProfitService';
import { OneTapProfitMonitor } from './services/OneTapProfitMonitor';
import { StabilityFundStreamer } from './services/StabilityFundStreamer';
import { createPriceRoute } from './routes/price';
import { createRelayRoute } from './routes/relay';
import { createOneTapProfitRoute } from './routes/oneTapProfit';
import { createFaucetRoute } from './routes/faucet';
import { Logger } from './utils/Logger';

dotenv.config();

const logger = new Logger('Main');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

type OracleMode = 'pyth' | 'chainlink';

function resolveOracleMode(): OracleMode {
  const argMode = process.argv.find((arg) => arg.startsWith('--oracle='))?.split('=')[1]?.toLowerCase();
  const envMode = (process.env.PRICE_ORACLE_MODE || 'pyth').toLowerCase();
  const selected = argMode || envMode;

  if (selected === 'chainlink') return 'chainlink';
  if (selected !== 'pyth') {
    logger.warn(`Unknown PRICE_ORACLE_MODE "${selected}", falling back to "pyth"`);
  }
  return 'pyth';
}

async function main() {
  try {
    const oracleMode = resolveOracleMode();
    logger.info(`Starting Tethra DEX Backend (${oracleMode.toUpperCase()} Oracle Mode)...`);

    const priceService: PriceService = oracleMode === 'chainlink'
      ? new ChainlinkPriceService()
      : new PythPriceService();
    priceServiceRef = priceService;
    const signerService = new PriceSignerService();
    const relayService = new RelayService();
    const oneTapProfitService = new OneTapProfitService();

    await priceService.initialize();

    const oneTapProfitMonitor = new OneTapProfitMonitor(priceService, oneTapProfitService);
    oneTapProfitMonitor.start();
    oneTapProfitMonitorRef = oneTapProfitMonitor;

    const stabilityFundStreamer = new StabilityFundStreamer();
    stabilityFundStreamer.start();
    stabilityFundStreamerRef = stabilityFundStreamer;

    if (!signerService.isInitialized()) {
      logger.warn('Price Signer not available (signed price endpoints disabled)');
    }

    const relayBalance = await relayService.getRelayBalance();
    if (parseFloat(relayBalance.ethFormatted) < 0.01) {
      logger.warn('Relay wallet has low ETH balance! Please fund for gasless transactions.');
    }

    const server = http.createServer(app);
    const wss = new WebSocketServer({ server, path: '/ws/price' });

    wss.on('connection', (ws) => {
      logger.info('New WebSocket client connected');

      const currentPrices = priceService.getCurrentPrices();
      if (Object.keys(currentPrices).length > 0) {
        ws.send(JSON.stringify({
          type: 'price_update',
          data: currentPrices,
          timestamp: Date.now()
        }));
      }

      ws.on('error', (error) => {
        logger.error('WebSocket client error:', error);
      });

      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
      });
    });

    priceService.onPriceUpdate((prices) => {
      const message = JSON.stringify({
        type: 'price_update',
        data: prices,
        timestamp: Date.now()
      });

      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(message);
        }
      });
    });

    app.get('/', (_req: Request, res: Response) => {
      res.json({
        success: true,
        message: `Tethra Tap-to-Profit Backend - ${oracleMode.toUpperCase()} Oracle`,
        version: '1.0.0',
        oracleMode,
        endpoints: {
          websocket: '/ws/price',
          prices: '/api/price',
          signedPrices: '/api/price/signed/:symbol',
          verifySignature: '/api/price/verify',
          signerStatus: '/api/price/signer/status',
          relay: '/api/relay',
          relayTransaction: '/api/relay/transaction',
          relayBalance: '/api/relay/balance/:address',
          relayStatus: '/api/relay/status',
          oneTapPlaceBet: '/api/one-tap/place-bet',
          oneTapBets: '/api/one-tap/bets',
          oneTapActive: '/api/one-tap/active',
          oneTapCalculateMultiplier: '/api/one-tap/calculate-multiplier',
          oneTapStats: '/api/one-tap/stats',
          oneTapStatus: '/api/one-tap/status',
          faucetClaim: '/api/faucet/claim',
          faucetStatus: '/api/faucet/status',
          health: '/health'
        },
        timestamp: Date.now()
      });
    });

    app.get('/health', (_req: Request, res: Response) => {
      const healthStatus = priceService.getHealthStatus();
      res.json({
        success: true,
        service: 'Tethra Tap-to-Profit Backend',
        uptime: process.uptime(),
        priceService: healthStatus,
        timestamp: Date.now()
      });
    });

    app.use('/api/price', createPriceRoute(priceService, signerService));
    app.use('/api/relay', createRelayRoute(relayService));
    app.use('/api/one-tap', createOneTapProfitRoute(oneTapProfitService, oneTapProfitMonitor));
    app.use('/api/faucet', createFaucetRoute());

    app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('Unhandled API error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        timestamp: Date.now()
      });
    });

    app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.path} not found`,
        timestamp: Date.now()
      });
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Stop other backend process or set PORT to another value.`);
      } else {
        logger.error('HTTP server error:', error);
      }
      process.exit(1);
    });

    server.listen(PORT, () => {
      logger.success(`Tethra Tap-to-Profit Backend running on port ${PORT}`);
    });

  } catch (error) {
    logger.error('Failed to start backend:', error);
    process.exit(1);
  }
}

let oneTapProfitMonitorRef: OneTapProfitMonitor | null = null;
let stabilityFundStreamerRef: StabilityFundStreamer | null = null;
let priceServiceRef: PriceService | null = null;

function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  if (priceServiceRef?.shutdown) {
    priceServiceRef.shutdown().catch((error) => logger.error('Error shutting down price service:', error));
  }
  if (oneTapProfitMonitorRef) {
    oneTapProfitMonitorRef.stop();
  }
  if (stabilityFundStreamerRef) {
    stabilityFundStreamerRef.stop();
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at promise:', { promise: promise.toString(), reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

main().catch((error) => {
  logger.error('Fatal error in main:', error);
  process.exit(1);
});
