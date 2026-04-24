import { Router, Request, Response } from 'express';
import { PriceWatcher } from '../services/PriceWatcher';

export function createPricesRouter(priceWatcher: PriceWatcher): Router {
  const router = Router();

  // GET /api/price/all
  router.get('/price/all', (_req: Request, res: Response) => {
    res.json({ success: true, data: priceWatcher.getLatestPrices() });
  });

  return router;
}
