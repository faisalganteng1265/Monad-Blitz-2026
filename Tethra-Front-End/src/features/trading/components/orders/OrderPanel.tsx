'use client';

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Zap } from 'lucide-react';
import MarketOrder from './order-panel/MarketOrder';
import LimitOrder from './order-panel/LimitOrder';
import TapToTrade from './order-panel/TaptoTrade';
import SwapPanel from './order-panel/SwapPanel';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';
import WalletConnectButton from '@/components/layout/WalletConnectButton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface OrderPanelProps {
  mobileActiveTab?: 'long' | 'short' | 'swap';
  mode?: 'market' | 'trade'; // 'market' = Market/Limit only, 'trade' = Tap-to-Trade only
  onMobileClose?: () => void;
}

const OrderPanel: React.FC<OrderPanelProps> = ({
  mobileActiveTab,
  mode = 'market',
  onMobileClose,
}) => {
  const [activeTab, setActiveTab] = useState<'long' | 'short' | 'swap'>(mobileActiveTab || 'short');
  const [activeOrderType, setActiveOrderType] = useState<
    'market' | 'limit' | 'Tap to Trade' | 'more'
  >(mode === 'trade' ? 'Tap to Trade' : 'market');

  // Sync with mobile tab if provided
  React.useEffect(() => {
    if (mobileActiveTab) {
      setActiveTab(mobileActiveTab);
    }
  }, [mobileActiveTab]);

  const { isEnabled: tapToTradeEnabled, tradeMode, setTradeMode } = useTapToTrade();

  const tabs = [
    {
      key: 'long' as const,
      label: 'Long',
      icon: <TrendingUp size={16} />,
      activeClass:
        'bg-long/15 border-b-2 border-long shadow-[inset_0_0_20px_rgba(22,199,132,0.3),0_0_10px_rgba(22,199,132,0.3)]',
      textClass: 'text-long',
    },
    {
      key: 'short' as const,
      label: 'Short',
      icon: <TrendingDown size={16} />,
      activeClass:
        'bg-short/15 border-b-2 border-short shadow-[inset_0_0_20px_rgba(234,57,67,0.3),0_0_10px_rgba(234,57,67,0.3)]',
      textClass: 'text-short',
    },
    {
      key: 'swap' as const,
      label: 'Swap',
      icon: <Zap size={16} />,
      activeClass:
        'bg-swap/15 border-b-2 border-swap shadow-[inset_0_0_20px_rgba(37,99,235,0.3),0_0_10px_rgba(37,99,235,0.3)]',
      textClass: 'text-swap',
    },
  ];

  const isTabDisabled = tapToTradeEnabled || activeOrderType === 'Tap to Trade';

  return (
    <div className="h-full flex flex-col text-text-primary relative overflow-hidden md:rounded-lg">
      {/* Wallet Connect Header - Hidden on Mobile and when TapToTrade is active */}
      {!tapToTradeEnabled && (
        <div className="md:flex hidden items-center justify-end p-2.5 usd bg-trading-dark flex-shrink-0 md:rounded-t-lg">
          <WalletConnectButton />
        </div>
      )}

      {/* Order Panel */}
      <div className="flex-1 flex flex-col bg-trading-bg overflow-hidden md:rounded-b-lg">
        {/* Tab Buttons */}
        <div className="flex border-b border-border-muted bg-trading-bg">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => !isTabDisabled && setActiveTab(tab.key)}
              disabled={isTabDisabled}
              className={`
                flex-1 py-4 text-sm font-bold transition-all duration-200 relative
                ${isTabDisabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}
                ${
                  activeTab === tab.key && !isTabDisabled
                    ? `text-text-primary ${tab.activeClass}`
                    : isTabDisabled
                    ? 'hidden'
                    : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent'
                }
              `}
            >
              <div className="flex items-center justify-center gap-2">
                {tab.icon}
                {tab.label}
              </div>
            </button>
          ))}
        </div>

        {/* Order Type Selector - Full Width Tabs */}
        <div className="px-4 py-3 border-b border-border-muted bg-trading-bg">
          {mode === 'trade' ? (
            // Trade mode: Open Position / One Tap Profit
            <Tabs
              value={tradeMode}
              onValueChange={(value) => {
                if (tapToTradeEnabled) return; // Double check protection
                setActiveOrderType('Tap to Trade');
                setTradeMode(value as 'open-position' | 'one-tap-profit' | 'quick-tap');
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3 h-10 bg-gradient-to-r from-info/20 to-success/20 p-1">
                <TabsTrigger
                  value="one-tap-profit"
                  disabled={activeTab === 'swap' || tapToTradeEnabled}
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-success data-[state=active]:to-success-dark data-[state=active]:text-white data-[state=active]:shadow-lg"
                >
                  One Tap Profit
                </TabsTrigger>
                <TabsTrigger
                  value="open-position"
                  disabled={activeTab === 'swap' || tapToTradeEnabled}
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-info data-[state=active]:to-info-dark data-[state=active]:text-white data-[state=active]:shadow-lg"
                >
                  Open Position
                </TabsTrigger>
                <TabsTrigger
                  value="quick-tap"
                  disabled={activeTab === 'swap' || tapToTradeEnabled}
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
                >
                  Quick Tap
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            // Market mode: Market / Limit
            <Tabs
              value={activeOrderType}
              onValueChange={(value) => setActiveOrderType(value as 'market' | 'limit')}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 h-10 bg-gradient-to-r from-long/20 to-swap/20 p-1">
                <TabsTrigger
                  value="market"
                  disabled={activeTab === 'swap'}
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-long data-[state=active]:to-long-hover data-[state=active]:text-white data-[state=active]:shadow-lg"
                >
                  Market
                </TabsTrigger>
                <TabsTrigger
                  value="limit"
                  disabled={activeTab === 'swap'}
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-swap data-[state=active]:to-swap-hover data-[state=active]:text-white data-[state=active]:shadow-lg"
                >
                  Limit
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar-dark relative">
          {activeTab === 'swap' ? (
            <SwapPanel />
          ) : (
            <>
              {activeOrderType === 'market' && <MarketOrder activeTab={activeTab} />}
              {activeOrderType === 'limit' && <LimitOrder activeTab={activeTab} />}
              {activeOrderType === 'Tap to Trade' && (
                <div className="relative min-h-full">
                  <TapToTrade onMobileClose={onMobileClose} />
                </div>
              )}
              {activeOrderType === 'more' && (
                <div className="text-center py-8 text-text-secondary">
                  <p>More order types coming soon...</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderPanel;
