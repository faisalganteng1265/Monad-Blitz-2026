import React from 'react';
import { formatPrice } from '../utils/formatUtils';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import { Market } from '../components/MarketSelector';

interface TradeInfoSectionProps {
  tradeMode: 'open-position' | 'one-tap-profit' | 'quick-tap';
  activeMarket: Market | null;
  marginUsdValue: number;
  leverage: number;
  timeframe: string;
  selectedTimeframeLabel: string;
  xCoordinate: string;
  yCoordinate: string;
}

export const TradeInfoSection: React.FC<TradeInfoSectionProps> = ({
  tradeMode,
  activeMarket,
  marginUsdValue,
  leverage,
  selectedTimeframeLabel,
  xCoordinate,
  yCoordinate,
}) => {
  return (
    <div className="text-xs text-text-muted space-y-1 border-t border-border-muted pt-3">
      <div className="flex justify-between">
        <span>Mode:</span>
        <span className="text-text-primary">
          {tradeMode === 'open-position'
            ? 'Open Position'
            : tradeMode === 'one-tap-profit'
            ? 'One Tap Profit'
            : 'Quick Tap'}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Market:</span>
        <span className="text-text-primary">
          {formatMarketPair(activeMarket?.symbol || 'BTC')}
        </span>
      </div>
      <div className="flex justify-between">
        <span>{tradeMode === 'one-tap-profit' ? 'Bet Amount:' : 'Margin:'}</span>
        <span className="text-text-primary">{formatPrice(marginUsdValue)}</span>
      </div>
      {tradeMode !== 'one-tap-profit' && (
        <div className="flex justify-between">
          <span>Leverage:</span>
          <span className="text-text-primary">{leverage.toFixed(1)}x</span>
        </div>
      )}
      {tradeMode === 'open-position' && (
        <div className="flex justify-between">
          <span>Timeframe:</span>
          <span className="text-text-primary">{selectedTimeframeLabel}</span>
        </div>
      )}
      {xCoordinate && (
        <div className="flex justify-between">
          <span>X (Time):</span>
          <span className="text-text-primary">{xCoordinate}</span>
        </div>
      )}
      {yCoordinate && (
        <div className="flex justify-between">
          <span>Y (Price):</span>
          <span className="text-text-primary">${yCoordinate}</span>
        </div>
      )}
    </div>
  );
};
