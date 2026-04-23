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
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import MobileMarketDetails from './MobileMarketDetails';
import MobileOrderTabs from './MobileOrderTabs';
import BottomPanelToggle from './BottomPanelToggle';
import StopTapToTradeButton from './StopTapToTradeButton';

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

export default function TradePageContent() {
  const { isEnabled, toggleMode, tradeMode, setTradeMode, setIsBinaryTradingEnabled } =
    useTapToTrade();
  const { activeMarket, currentPrice } = useMarket();
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [isMobileOrderPanelOpen, setIsMobileOrderPanelOpen] = useState(false);
  const [isMobileCoinInfoOpen, setIsMobileCoinInfoOpen] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<'long' | 'short' | 'swap'>('long');
  const [marketDataState, setMarketDataState] = useState<MarketData | null>(null);
  // Vertical Resize Logic (Bottom Panel)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(300); // Default 300px
  const [isResizingBottom, setIsResizingBottom] = useState(false);

  useEffect(() => {
    const handleMouseMoveBottom = (e: MouseEvent) => {
      if (!isResizingBottom) return;

      // Calculate new height: Total Height - Mouse Y
      // We need to account for the bottom of the window
      const newHeight = window.innerHeight - e.clientY;

      // Constraints: Min 200px, Max 80vh
      if (newHeight >= 200 && newHeight <= window.innerHeight * 0.8) {
        setBottomPanelHeight(newHeight);
      }
    };

    const handleMouseUpBottom = () => {
      setIsResizingBottom(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    if (isResizingBottom) {
      window.addEventListener('mousemove', handleMouseMoveBottom);
      window.addEventListener('mouseup', handleMouseUpBottom);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMoveBottom);
      window.removeEventListener('mouseup', handleMouseUpBottom);
    };
  }, [isResizingBottom]);

  const [activeMarketState, setActiveMarketState] = useState<ActiveMarket | null>(null);

  // Resizable Panel State (Right - Order Panel)
  const [panelWidth, setPanelWidth] = useState(30); // Default 30vw
  const [isResizing, setIsResizing] = useState(false);

  // Handle Resize Logic (Right Panel)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate width as percentage of window width (Right panel grows as mouse moves left)
      // New Width = ((Window Width - Mouse X) / Window Width) * 100
      const newWidth = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;

      // Clamp between 20vw and 50vw
      if (newWidth >= 20 && newWidth <= 50) {
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = ''; // Re-enable selection
      document.body.style.cursor = '';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none'; // Disable text selection while dragging
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const isTapToTradeActive = isEnabled;

  const priceValue = currentPrice ? parseFloat(currentPrice) : null;
  const pairName = activeMarket?.symbol || 'BTC/USDT';
  useDynamicTitle(priceValue, pairName);

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

  const handleStopTrading = async () => {
    if (tradeMode === 'one-tap-profit') {
      setIsBinaryTradingEnabled(false);
      await toggleMode();
      // toast.success('Binary Trading stopped'); // toast is not imported in this file, toggleMode might handle errors
    } else {
      await toggleMode();
    }
  };

  return (
    <main className="bg-trading-dark text-text-primary h-screen flex flex-col relative lg:p-2 p-2 lg:overflow-hidden overflow-auto">
      {/* Mobile Header - Hidden when trading is active */}
      {!isTapToTradeActive && <MobileHeader rightContent={<WalletConnectButton />} />}

      <div
        className="flex flex-col lg:flex-row w-full flex-1 lg:gap-2 gap-2 lg:overflow-hidden"
        style={{ minHeight: 0 }}
      >
        {/* Left Sidebar - Responsive (hidden on mobile, overlay on mobile when open) */}
        {!isTapToTradeActive && (
          <Sidebar>
            <SidebarContent />
          </Sidebar>
        )}

        {/* Center - Chart and Bottom Trading */}
        <div className="lg:flex-1 flex flex-col min-w-0 relative" style={{ minHeight: 0 }}>
          {/* Trading Chart */}
          <div
            className="transition-all duration-300 relative flex-1"
            style={{
              minHeight: 0, // Allow shrinking
              display: 'flex',
              flexDirection: 'column',
              marginBottom: isTapToTradeActive ? 0 : 0,
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

            {/* Desktop Floating Stop Button - Distraction Free Mode */}
            {isTapToTradeActive && (
              <div className="hidden lg:block absolute bottom-6 right-6 z-50">
                <button
                  onClick={handleStopTrading}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg flex items-center gap-2 transform transition-transform hover:scale-105"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M18 6L6 18" />
                    <path d="M6 6L18 18" />
                  </svg>
                  Stop Trading
                </button>
              </div>
            )}
          </div>

          {/* Bottom Panel - Different behavior for Tap to Trade modes */}
          {isTapToTradeActive ? (
            /* Tap to Trade Active - Toggle button with overlay */
            <>
              {/* Bottom Panel - Overlays the chart when open */}
              {isBottomPanelOpen && (
                <div
                  className="absolute bottom-0 left-0 right-0 z-10 transition-all duration-300 flex flex-col mb-0 lg:mb-0"
                  style={{
                    height: '40vh',
                    minHeight: '200px',
                    maxHeight: '50vh',
                  }}
                >
                  {/* Toggle Button at the top of the panel */}
                  <BottomPanelToggle
                    isOpen={true}
                    onToggle={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
                  />

                  {/* Bottom Panel Content */}
                  <div className="flex-1 overflow-hidden">
                    <BottomTrading />
                  </div>
                </div>
              )}

              {/* Desktop "Open Positions" Button - When panel is closed */}
              {!isBottomPanelOpen && (
                <BottomPanelToggle isOpen={false} onToggle={() => setIsBottomPanelOpen(true)} />
              )}
            </>
          ) : (
            /* Normal mode - Resizable Bottom Panel */
            <>
              {/* Resize Handle */}
              <div
                className="hidden lg:flex w-full h-1 hover:bg-blue-500/50 cursor-row-resize items-center justify-center transition-colors group z-20 my-1"
                onMouseDown={() => setIsResizingBottom(true)}
              >
                <div
                  className={`h-0.5 w-8 bg-gray-600 group-hover:bg-blue-400 rounded-full transition-colors ${
                    isResizingBottom ? 'bg-blue-500 w-32' : ''
                  }`}
                />
              </div>

              <div
                className="lg:w-full transition-all duration-75 mb-10 lg:mb-0"
                style={{
                  height: `${bottomPanelHeight}px`,
                  minHeight: '200px',
                  maxHeight: '80vh',
                }}
              >
                <BottomTrading />
              </div>
            </>
          )}
        </div>

        {/* Resize Handle - Desktop Only - Hidden when TapToTrade Active */}
        {!isTapToTradeActive && (
          <div
            className="hidden lg:flex w-1 hover:bg-blue-500/50 cursor-col-resize items-center justify-center transition-colors group z-20"
            onMouseDown={() => setIsResizing(true)}
          >
            <div
              className={`w-0.5 h-8 bg-gray-600 group-hover:bg-blue-400 rounded-full transition-colors ${
                isResizing ? 'bg-blue-500 h-16' : ''
              }`}
            />
          </div>
        )}

        {/* Right Order Panel - Hidden on mobile, shows as bottom sheet. ALSO HIDDEN ON DESKTOP IF TAP TO TRADE ACTIVE */}
        {!isTapToTradeActive && (
          <div
            className="hidden lg:flex shrink-0 flex-col"
            style={{
              width: `${panelWidth}vw`,
              minWidth: '300px',
              maxWidth: '50vw',
            }}
          >
            <OrderPanel mode="trade" />
          </div>
        )}

        {/* Tap to Trade "Open Positions" Button - Mobile Only, Independent */}
        {isTapToTradeActive && !isBottomPanelOpen && (
          <BottomPanelToggle
            isOpen={false}
            onToggle={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
            isMobile={true}
          />
        )}

        {/* Mobile Order Panel - Bottom Sheet */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
          {/* Long/Short/Swap Tabs OR Stop Tap to Trade Button */}
          {!isMobileOrderPanelOpen && (
            <>
              {isTapToTradeActive ? (
                /* Stop Tap to Trade Button */
                <StopTapToTradeButton onStop={handleStopTrading} />
              ) : (
                /* Normal Mode: Long/Short/Swap Tabs */
                <MobileOrderTabs
                  mode="trade"
                  activeTradeMode={tradeMode}
                  onTradeModeClick={(mode) => {
                    setTradeMode(mode);
                    setIsMobileOrderPanelOpen(true);
                  }}
                />
              )}
            </>
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
                <OrderPanel
                  mobileActiveTab={mobileActiveTab}
                  mode="trade"
                  onMobileClose={() => setIsMobileOrderPanelOpen(false)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Price Ticker at bottom - Hidden when trading is active */}
      {!isTapToTradeActive && <PriceTicker />}
    </main>
  );
}
