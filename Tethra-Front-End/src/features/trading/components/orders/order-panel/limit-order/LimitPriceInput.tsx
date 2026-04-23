import React from 'react';
import { formatPrice } from '../utils/formatUtils';
import Image from 'next/image';
import { Market } from '../components/MarketSelector';

interface LimitPriceInputProps {
  limitPrice: string;
  onLimitPriceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  effectiveOraclePrice: number;
  activeTab: 'long' | 'short' | 'swap';
  activeMarket: Market | null;
  limitPriceError?: string;
}

export const LimitPriceInput: React.FC<LimitPriceInputProps> = ({
  limitPrice,
  onLimitPriceChange,
  effectiveOraclePrice,
  activeTab,
  activeMarket,
  limitPriceError,
}) => {
  return (
    <div className="bg-trading-surface border border-border-default rounded-lg p-3">
      <div className="flex justify-between items-center mb-2">
        <label className="text-xs text-text-secondary">Limit Price</label>
        <span className="text-xs text-info-light">Mark: {formatPrice(effectiveOraclePrice)}</span>
      </div>
      <div className="flex items-center justify-between">
        <input
          type="text"
          placeholder="0.0"
          value={limitPrice}
          onChange={onLimitPriceChange}
          className={`bg-transparent text-xl text-text-primary outline-none w-full ${
            limitPriceError ? 'text-destructive' : ''
          }`}
        />
        {activeTab === 'swap' ? (
          <div className="flex items-center gap-1.5 text-text-primary font-semibold text-sm whitespace-nowrap ml-3">
            <Image
              src="/icons/usdc.png"
              alt="USDC"
              width={20}
              height={20}
              className="rounded-full flex-shrink-0"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
              }}
            />
            <span>USDC per</span>
            {activeMarket && (
              <div className="flex items-center gap-1">
                {activeMarket.logoUrl && (
                  <Image
                    src={activeMarket.logoUrl}
                    alt={activeMarket.symbol}
                    width={20}
                    height={20}
                    className="rounded-full flex-shrink-0"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                    }}
                  />
                )}
                <span>{activeMarket.symbol}</span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-text-primary font-semibold">USD</span>
        )}
      </div>
      {limitPriceError && (
        <span className="text-xs text-destructive mt-1 block">{limitPriceError}</span>
      )}
    </div>
  );
};
