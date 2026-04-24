import 'dotenv/config';
import { Logger } from './utils/Logger';
import { BetScanner } from './services/BetScanner';
import { PriceWatcher } from './services/PriceWatcher';
import { WinDetector } from './services/WinDetector';
import { Settler } from './services/Settler';
import { ExpiryCleanup } from './services/ExpiryCleanup';

const logger = new Logger('Main');

async function main(): Promise<void> {
  logger.info('Starting TapX solver...');

  const scanner = new BetScanner();
  const detector = new WinDetector(scanner);
  const priceWatcher = new PriceWatcher();
  const settler = new Settler(scanner, detector);
  const cleanup = new ExpiryCleanup(scanner);

  // Wire price updates → win detection
  priceWatcher.onPriceUpdate((update) => detector.onPriceUpdate(update));

  // Start all services
  await scanner.start();
  priceWatcher.start();
  settler.start();
  cleanup.start();

  logger.info('TapX solver running');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    settler.stop();
    cleanup.stop();
    priceWatcher.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
