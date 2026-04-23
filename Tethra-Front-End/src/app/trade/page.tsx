'use client';

import { MarketProvider } from '@/features/trading/contexts/MarketContext';
import { GridTradingProvider } from '@/contexts/GridTradingContext';
import { TapToTradeProvider } from '@/features/trading/contexts/TapToTradeContext';
import TradePageContent from '@/features/trading/components/trade-content/TradePageContent';

export default function TradePage() {
  return (
    <MarketProvider>
      <GridTradingProvider>
        <TapToTradeProvider>
          <TradePageContent />
        </TapToTradeProvider>
      </GridTradingProvider>
    </MarketProvider>
  );
}
