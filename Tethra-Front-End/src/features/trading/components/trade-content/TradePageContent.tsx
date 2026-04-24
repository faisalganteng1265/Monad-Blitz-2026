'use client';

import WalletConnectButton from '@/components/layout/WalletConnectButton';
import PriceTicker from '@/components/layout/PriceTicker';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import { useDynamicTitle } from '@/hooks/utils/useDynamicTitle';
import TradingChart from '@/features/trading/components/charts/TradingChart';
import TradingGrid from '@/features/trading/components/TradingGrid';
import SessionControls from '@/features/trading/components/SessionControls';
import { useBetEvents } from '@/features/trading/hooks/useBetEvents';

export default function TradePageContent() {
  const { activeMarket, currentPrice } = useMarket();

  const priceValue = currentPrice ? parseFloat(currentPrice) : null;
  const pairName = activeMarket?.symbol || 'BTC/USDT';
  useDynamicTitle(priceValue, pairName);

  const currentPriceBigInt = BigInt(Math.round((priceValue ?? 0) * 1e8));
  const { activeBets } = useBetEvents(currentPriceBigInt);

  return (
    <main className="bg-trading-dark text-text-primary min-h-screen flex flex-col relative">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
        <a href="/" className="flex items-center gap-2 hover:opacity-80">
          <span className="text-xl font-bold text-white">TapX</span>
          <span className="text-xs text-text-secondary uppercase tracking-wider">
            Tap to Profit
          </span>
        </a>
        <WalletConnectButton />
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Price chart */}
        <div className="flex-1 min-h-[40vh]">
          <TradingChart />
        </div>

        {/* Session controls + trading grid */}
        <div className="border-t border-border-muted bg-[#0B1017]">
          <SessionControls />
          <div className="px-2 py-2 overflow-auto max-h-[45vh]">
            <TradingGrid
              currentPrice={priceValue ?? 0}
              activeBets={activeBets}
            />
          </div>
        </div>
      </div>

      <PriceTicker />
    </main>
  );
}
