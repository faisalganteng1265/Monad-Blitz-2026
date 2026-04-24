'use client';

import PriceTicker from '@/components/layout/PriceTicker';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import { useDynamicTitle } from '@/hooks/utils/useDynamicTitle';
import TradingChart from '@/features/trading/components/charts/TradingChart';
import SessionControls from '@/features/trading/components/SessionControls';

export default function TradePageContent() {
  const { activeMarket, currentPrice } = useMarket();

  const priceValue = currentPrice ? parseFloat(currentPrice) : null;
  const pairName = activeMarket?.symbol || 'BTC/USDT';
  useDynamicTitle(priceValue, pairName);

  return (
    <main className="bg-trading-dark text-text-primary h-screen flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-row min-h-0">
        {/* Price chart — kiri */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <TradingChart />
        </div>

        {/* Right panel — lebar tetap, pas satu layar, tanpa scroll */}
        <div className="w-72 shrink-0 flex flex-col border-l border-border-muted bg-[#0B1017] h-full overflow-hidden">
          <SessionControls />
        </div>
      </div>

      <PriceTicker />
    </main>
  );
}
