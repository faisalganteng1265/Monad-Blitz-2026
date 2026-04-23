'use client';

import TradingChart from '@/features/trading/components/charts/TradingChart';
import WalletConnectButton from '@/components/layout/WalletConnectButton';
import PriceTicker from '@/components/layout/PriceTicker';
import OneTapProfitTab from '@/features/trading/components/orders/OneTapProfitTab';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import { useDynamicTitle } from '@/hooks/utils/useDynamicTitle';

export default function TradePageContent() {
  const { activeMarket, currentPrice } = useMarket();

  const priceValue = currentPrice ? parseFloat(currentPrice) : null;
  const pairName = activeMarket?.symbol || 'BTC/USDT';
  useDynamicTitle(priceValue, pairName);

  return (
    <main className="bg-trading-dark text-text-primary min-h-screen flex flex-col relative">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
        <a href="/" className="flex items-center gap-2 hover:opacity-80">
          <span className="text-xl font-bold text-white">Tethra</span>
          <span className="text-xs text-text-secondary uppercase tracking-wider">
            Tap to Profit
          </span>
        </a>
        <WalletConnectButton />
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-[60vh]">
          <TradingChart />
        </div>

        <div className="border-t border-border-muted bg-[#0B1017]">
          <div className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Active Bets
          </div>
          <div className="min-h-[200px] max-h-[40vh] overflow-auto">
            <OneTapProfitTab />
          </div>
        </div>
      </div>

      <PriceTicker />
    </main>
  );
}
