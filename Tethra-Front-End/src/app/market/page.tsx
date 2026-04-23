'use client';

import { MarketProvider } from '@/features/trading/contexts/MarketContext';
import { GridTradingProvider } from '@/contexts/GridTradingContext';
import { TapToTradeProvider } from '@/features/trading/contexts/TapToTradeContext';
import MarketPageContent from '@/features/trading/components/market-content/MarketPageContent';

export default function MarketPage() {
  return (
    <MarketProvider>
      <GridTradingProvider>
        <TapToTradeProvider>
          <MarketPageContent />
        </TapToTradeProvider>
      </GridTradingProvider>
    </MarketProvider>
  );
}
