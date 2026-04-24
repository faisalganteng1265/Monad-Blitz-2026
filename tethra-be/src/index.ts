import 'dotenv/config';
import { Logger } from './utils/Logger';
import { BetScanner } from './services/BetScanner';
import { PriceWatcher } from './services/PriceWatcher';
import { WinDetector } from './services/WinDetector';
import { Settler } from './services/Settler';
import { ExpiryCleanup } from './services/ExpiryCleanup';
import { createServer } from './server';

const logger = new Logger('Main');
const PORT = parseInt(process.env.PORT ?? '3001');

async function main(): Promise<void> {
  logger.info('Starting TapX solver...');

  const scanner = new BetScanner();
  const priceWatcher = new PriceWatcher();
  const detector = new WinDetector(scanner, priceWatcher);
  const settler = new Settler(scanner);
  const cleanup = new ExpiryCleanup(scanner, detector, settler, priceWatcher);

  // Wire win detection → immediate settlement
  detector.onWin((entry) => settler.settle(entry));

  // Wire price updates → win detection (realtime ticks)
  priceWatcher.onPriceUpdate((update) => detector.onPriceUpdate(update));

  // Start all services
  await scanner.start();
  priceWatcher.start();
  detector.start();   // starts 1s sweep
  settler.start();
  cleanup.start();

  // Start HTTP + WebSocket server
  const server = createServer({ scanner, priceWatcher });
  server.listen(PORT, () => {
    logger.info(`HTTP server listening on http://localhost:${PORT}`);
  });

  logger.info('TapX solver running');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    detector.stop();
    settler.stop();
    cleanup.stop();
    priceWatcher.shutdown();
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
