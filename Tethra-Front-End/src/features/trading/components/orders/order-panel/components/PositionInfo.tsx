import React from 'react';
import { MarketSelector, Market } from '../components/MarketSelector';
import { formatTokenAmount, formatPrice, formatLeverage } from '../utils/formatUtils';

interface PositionInfoProps {
  activeTab: 'long' | 'short' | 'swap';
  payUsdValue: number;
  oraclePrice: number;
  longShortUsdValue: number;
  tokenAmount: number;
  leverage: number;
  activeMarket: Market | null;
  onMarketSelect: (market: Market) => void;
}

export const PositionInfo: React.FC<PositionInfoProps> = ({
  activeTab,
  payUsdValue,
  oraclePrice,
  longShortUsdValue,
  tokenAmount,
  leverage,
  activeMarket,
  onMarketSelect,
}) => {
  return (
    <div className="bg-trading-surface border border-border-default rounded-lg p-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">
            {activeTab === 'long'
              ? 'Long Position Size'
              : activeTab === 'short'
              ? 'Short Position Size'
              : 'Swap Receive'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          {/* Price Input - Left Side */}
          <input
            type="text"
            placeholder="0.0"
            value={
              activeTab === 'swap'
                ? tokenAmount > 0
                  ? formatTokenAmount(payUsdValue / oraclePrice)
                  : ''
                : tokenAmount > 0
                ? formatTokenAmount(tokenAmount)
                : ''
            }
            readOnly
            className="bg-transparent text-xl font-medium text-text-primary outline-none cursor-not-allowed flex-1 min-w-0"
          />
          {/* Market Selector - Right Side */}
          <div className="flex-shrink-0">
            <MarketSelector value={activeMarket ?? undefined} onSelect={onMarketSelect} />
          </div>
        </div>
        <div className="flex justify-between items-center text-xs pt-1">
          <span className="text-text-secondary font-medium">
            ≈ {activeTab === 'swap' ? formatPrice(payUsdValue) : formatPrice(longShortUsdValue)}
          </span>
          {activeTab !== 'swap' && (
            <span className={`font-medium ${leverage >= 50 ? 'text-warning' : 'text-info'}`}>
              {formatLeverage(leverage)}x Leverage
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
