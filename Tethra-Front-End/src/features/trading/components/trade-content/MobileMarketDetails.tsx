import Image from 'next/image';
import React from 'react';

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

interface MobileMarketDetailsProps {
  isOpen: boolean;
  marketData: MarketData | null;
  activeMarket: ActiveMarket | null;
  currentPrice: string | null;
}

export default function MobileMarketDetails({
  isOpen,
  marketData,
  activeMarket,
  currentPrice,
}: MobileMarketDetailsProps) {
  if (!isOpen) return null;

  return (
    <div
      className="lg:hidden absolute left-0 right-0 bg-trading-panel border-b border-border-default shadow-lg z-20 animate-slide-down"
      style={{ top: '60px' }}
    >
      {/* Market Info Content */}
      <div className="p-3 relative">
        {/* Coin Logo - Top Right */}
        {activeMarket && (
          <Image
            src={`${activeMarket.logoUrl}`}
            alt={`${activeMarket.symbol}`}
            className="absolute top-2 right-2 w-10 h-10 rounded-full bg-trading-surface ring-2 ring-border-light"
            onError={(e) => {
              const target = e.currentTarget;
              target.onerror = null;
              target.style.visibility = 'hidden';
            }}
          />
        )}

        {/* Price Info Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-text-secondary mb-1">Current Price</div>
            <div className="text-sm font-mono font-semibold text-text-primary">
              {currentPrice
                ? `$${parseFloat(currentPrice).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : '$--'}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-secondary mb-1">24h Change</div>
            <div
              className={`text-sm font-mono font-semibold ${
                marketData?.priceChangePercent
                  ? parseFloat(marketData.priceChangePercent) >= 0
                    ? 'text-success'
                    : 'text-error'
                  : 'text-text-muted'
              }`}
            >
              {marketData?.priceChangePercent
                ? `${parseFloat(marketData.priceChangePercent) >= 0 ? '+' : ''}${parseFloat(
                    marketData.priceChangePercent,
                  ).toFixed(2)}%`
                : '+0.00%'}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-secondary mb-1">24h High</div>
            <div className="text-xs font-mono text-text-primary">
              {marketData?.high24h
                ? `$${parseFloat(marketData.high24h).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : '$--'}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-secondary mb-1">24h Low</div>
            <div className="text-xs font-mono text-text-primary">
              {marketData?.low24h
                ? `$${parseFloat(marketData.low24h).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : '$--'}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-secondary mb-1">24h Volume</div>
            <div className="text-xs font-mono text-text-primary">
              {marketData?.volume24h
                ? (() => {
                    const vol = parseFloat(marketData.volume24h);
                    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`;
                    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`;
                    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(2)}K`;
                    return `$${vol.toFixed(2)}`;
                  })()
                : '--'}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-secondary mb-1">Open Interest</div>
            <div className="text-xs font-mono text-text-primary">
              {marketData?.openInterestValue
                ? (() => {
                    const oi = parseFloat(marketData.openInterestValue);
                    if (oi >= 1e9) return `$${(oi / 1e9).toFixed(2)}B`;
                    if (oi >= 1e6) return `$${(oi / 1e6).toFixed(2)}M`;
                    if (oi >= 1e3) return `$${(oi / 1e3).toFixed(2)}K`;
                    return `$${oi.toFixed(2)}`;
                  })()
                : '--'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
