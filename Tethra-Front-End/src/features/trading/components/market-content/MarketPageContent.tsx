import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/ResponsiveSidebar';
import SidebarContent from '@/components/layout/SidebarContent';
import MobileHeader from '@/components/layout/MobileHeader';
import TradingChart from '@/features/trading/components/charts/TradingChart';
import OrderPanel from '@/features/trading/components/orders/OrderPanel';
import BottomTrading from '@/components/layout/BottomTrading';
import WalletConnectButton from '@/components/layout/WalletConnectButton';
import { useDynamicTitle } from '@/hooks/utils/useDynamicTitle';
import PriceTicker from '@/components/layout/PriceTicker';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import MobileMarketDetails from '../trade-content/MobileMarketDetails';
import MobileOrderTabs from '../trade-content/MobileOrderTabs';

interface MarketData {
  priceChangePercent?: string;
  high24h?: string;
  low24h?: string;
  volume24h?: string;
  openInterestValue?: string;
}

interface ActiveMarket {
  symbol?: string;
  logoUrl?: string;
}

export default function MarketPageContent() {
  const { activeMarket, currentPrice } = useMarket();
  const [isMobileOrderPanelOpen, setIsMobileOrderPanelOpen] = useState(false);
  const [isMobileCoinInfoOpen, setIsMobileCoinInfoOpen] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<'long' | 'short' | 'swap'>('long');
  const [marketDataState, setMarketDataState] = useState<MarketData | null>(null);
  const [activeMarketState, setActiveMarketState] = useState<ActiveMarket | null>(null);

  // Dynamic title with price and pair
  const priceValue = currentPrice ? parseFloat(currentPrice) : null;
  const pairName = activeMarket?.symbol || 'BTC/USDT';
  useDynamicTitle(priceValue, pairName);

  // Listen for mobile coin info toggle event
  useEffect(() => {
    const handleToggleCoinInfo = (event: CustomEvent) => {
      setIsMobileCoinInfoOpen((prev) => !prev);
      if (event.detail?.marketData) {
        setMarketDataState(event.detail.marketData);
      }
      if (event.detail?.activeMarket) {
        setActiveMarketState(event.detail.activeMarket);
      }
    };

    window.addEventListener('toggleMobileCoinInfo', handleToggleCoinInfo as EventListener);
    return () =>
      window.removeEventListener('toggleMobileCoinInfo', handleToggleCoinInfo as EventListener);
  }, []);

  return (
    <main className="bg-trading-dark text-text-primary h-screen flex flex-col relative lg:p-2 p-2 lg:overflow-hidden overflow-auto">
      {/* Mobile Header */}
      <MobileHeader rightContent={<WalletConnectButton />} />

      <div
        className="flex flex-col lg:flex-row w-full flex-1 lg:gap-2 gap-2 lg:overflow-hidden"
        style={{ minHeight: 0 }}
      >
        {/* Left Sidebar - Responsive */}
        <Sidebar>
          <SidebarContent />
        </Sidebar>

        {/* Center - Chart and Bottom Trading */}
        <div
          className="lg:flex-1 flex flex-col min-w-0 relative lg:gap-2"
          style={{ minHeight: 0, gap: '0.5rem' }}
        >
          {/* Trading Chart */}
          <div
            className="transition-all duration-300 relative flex-1"
            style={{
              minHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <TradingChart />

            {/* Mobile Market Details Dropdown - Below Chart Header */}
            <MobileMarketDetails
              isOpen={isMobileCoinInfoOpen}
              marketData={marketDataState}
              activeMarket={activeMarketState || activeMarket}
              currentPrice={currentPrice}
            />
          </div>

          {/* Bottom Trading Panel - Regular layout */}
          <div
            className="lg:flex-1 transition-all duration-300 mb-20 lg:mb-0"
            style={{
              minHeight: '400px',
              maxHeight: '40vh',
            }}
          >
            <BottomTrading />
          </div>
        </div>

        {/* Right Order Panel - Hidden on mobile */}
        <div
          className="hidden lg:flex shrink-0 flex-col"
          style={{
            width: '30vw',
            minWidth: '300px',
            maxWidth: '520px',
          }}
        >
          <OrderPanel mode="market" />
        </div>

        {/* Mobile Order Panel - Bottom Sheet */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
          {/* Long/Short/Swap Tabs */}
          {!isMobileOrderPanelOpen && (
            <MobileOrderTabs
              mobileActiveTab={mobileActiveTab}
              onTabClick={(tab) => {
                setMobileActiveTab(tab);
                setIsMobileOrderPanelOpen(true);
              }}
            />
          )}

          {/* Bottom Sheet Panel */}
          {isMobileOrderPanelOpen && (
            <>
              {/* Backdrop - Click to close */}
              <div
                className="fixed inset-0 bg-black/40 -z-10"
                onClick={() => setIsMobileOrderPanelOpen(false)}
              />

              {/* Panel */}
              <div
                className="bg-[#0B1017] shadow-2xl animate-slide-up rounded-t-lg"
                style={{ maxHeight: '85vh', overflowY: 'auto' }}
              >
                {/* Order Panel Content */}
                <OrderPanel mobileActiveTab={mobileActiveTab} mode="market" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Price Ticker at bottom */}
      <PriceTicker />
    </main>
  );
}
