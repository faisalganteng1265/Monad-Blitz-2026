import React from 'react';
import { MousePointerClick, TrendingUp, Zap } from 'lucide-react';

interface MobileOrderTabsProps {
  mobileActiveTab?: 'long' | 'short' | 'swap';
  onTabClick?: (tab: 'long' | 'short' | 'swap') => void;
  mode?: 'market' | 'trade';
  activeTradeMode?: 'open-position' | 'one-tap-profit' | 'quick-tap';
  onTradeModeClick?: (mode: 'open-position' | 'one-tap-profit' | 'quick-tap') => void;
}

export default function MobileOrderTabs({
  mobileActiveTab,
  onTabClick,
  mode = 'market',
  activeTradeMode,
  onTradeModeClick,
}: MobileOrderTabsProps) {
  if (mode === 'trade') {
    return (
      <div className="flex items-center bg-trading-panel">
        <button
          onClick={() => onTradeModeClick && onTradeModeClick('one-tap-profit')}
          className={`flex-1 py-3.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
            activeTradeMode === 'one-tap-profit'
              ? 'bg-success/20 text-success border-t-2 border-success'
              : 'bg-trading-surface text-text-secondary hover:bg-button-hover border-t-2 border-transparent'
          }`}
        >
          <MousePointerClick size={16} />
          One Tap Profit
        </button>
        <button
          onClick={() => onTradeModeClick && onTradeModeClick('open-position')}
          className={`flex-1 py-3.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
            activeTradeMode === 'open-position'
              ? 'bg-info/20 text-info border-t-2 border-info'
              : 'bg-trading-surface text-text-secondary hover:bg-button-hover border-t-2 border-transparent'
          }`}
        >
          <TrendingUp size={16} />
          Open Position
        </button>
        <button
          onClick={() => onTradeModeClick && onTradeModeClick('quick-tap')}
          className={`flex-1 py-3.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
            activeTradeMode === 'quick-tap'
              ? 'bg-warning/20 text-warning border-t-2 border-warning'
              : 'bg-trading-surface text-text-secondary hover:bg-button-hover border-t-2 border-transparent'
          }`}
        >
          <Zap size={16} />
          Quick Tap
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center bg-trading-panel">
      <button
        onClick={() => onTabClick && onTabClick('long')}
        className={`flex-1 py-3.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
          mobileActiveTab === 'long'
            ? 'bg-long text-text-primary hover:bg-long-active'
            : 'bg-trading-surface text-text-secondary hover:bg-button-hover'
        }`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
          <polyline points="17 6 23 6 23 12"></polyline>
        </svg>
        Long
      </button>
      <button
        onClick={() => onTabClick && onTabClick('short')}
        className={`flex-1 py-3.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
          mobileActiveTab === 'short'
            ? 'bg-short text-text-primary hover:bg-short-active'
            : 'bg-trading-surface text-text-secondary hover:bg-button-hover'
        }`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline>
          <polyline points="17 18 23 18 23 12"></polyline>
        </svg>
        Short
      </button>
      <button
        onClick={() => onTabClick && onTabClick('swap')}
        className={`flex-1 py-3.5 font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
          mobileActiveTab === 'swap'
            ? 'bg-swap text-text-primary hover:bg-swap-active'
            : 'bg-trading-surface text-text-secondary hover:bg-button-hover'
        }`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
        </svg>
        Swap
      </button>
    </div>
  );
}
