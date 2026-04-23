'use client';

import React from 'react';
import { FuturesData, Market, MarketData } from '@/features/trading/types';
import {
  formatPrice,
  formatVolume,
  formatFundingRate,
  formatTimeUntil,
} from '@/features/trading/lib/formatters';
import MarketSelector from './MarketSelector';
import RealTimeClock from './RealTimeClock';
import Image from 'next/image';
import { formatDynamicUsd, formatMarketPair } from '@/features/trading/lib/marketUtils';

interface OraclePrice {
  symbol: string;
  price: number;
  confidence?: number;
  timestamp: number;
  source: string;
}

interface ChartHeaderProps {
  activeMarket: Market | null;
  marketData: MarketData | null;
  futuresData: FuturesData | null;
  allPrices: Record<string, string>;
  marketDataMap: Record<string, MarketData>;
  futuresDataMap: Record<string, FuturesData>;
  oraclePrice: OraclePrice | null;
  oraclePrices: Record<string, { price: number }>;
  onSymbolChangeClick: () => void;
  isMarketSelectorOpen: boolean;
  onClose: () => void;
  markets: Market[];
  onSelect: (symbol: string) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  disabled?: boolean;
}

export default function ChartHeader(props: ChartHeaderProps) {
  // Use Oracle price data if available, otherwise fallback to Binance
  const oraclePriceValue = props.oraclePrice?.price ?? undefined;
  const displayPrice = Number.isFinite(oraclePriceValue)
    ? oraclePriceValue
    : props.marketData?.price
    ? parseFloat(props.marketData.price)
    : NaN;
  const priceChangePercent = props.marketData?.priceChangePercent
    ? parseFloat(props.marketData.priceChangePercent)
    : 0;
  const isPositive = priceChangePercent >= 0;
  const fundingRate = props.futuresData ? parseFloat(props.futuresData.fundingRate) : 0;
  const isFundingPositive = fundingRate >= 0;
  const isCrypto = props.activeMarket?.category === 'crypto';

  const formatUsd = (value: number) => formatDynamicUsd(value);

  return (
    <div
      className="flex flex-wrap items-center justify-between md:px-4 px-2 md:py-2 py-1.5"
      style={{
        gap: '0.75rem',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
    >
      <div className="flex items-center md:gap-x-6 md:gap-y-3 gap-3 flex-wrap">
        <div className="relative" style={{ zIndex: 11 }}>
          <button
            ref={props.triggerRef}
            onClick={() => !props.disabled && props.onSymbolChangeClick()}
            disabled={props.disabled}
            className={`flex items-center gap-2 bg-gradient-to-r from-trading-surface to-trading-elevated border border-border-default rounded-lg px-4 py-2.5 text-sm font-bold text-text-primary transition-all duration-200 shadow-lg ${'hover:from-trading-elevated hover:to-trading-surface hover:border-border-light hover:shadow-xl cursor-pointer'}`}
          >
            {props.activeMarket && (
              <Image
                src={`${props.activeMarket.logoUrl || '/icons/usdc.png'}`}
                alt={`${props.activeMarket.symbol}`}
                width={24}
                height={24}
                className="w-6 h-6 rounded-full bg-trading-surface ring-2 ring-border-light"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.onerror = null;
                  target.style.visibility = 'hidden';
                }}
              />
            )}
            <span className="text-base">
              {props.activeMarket ? formatMarketPair(props.activeMarket.symbol) : ''}
            </span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${
                props.isMarketSelectorOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <MarketSelector
            isOpen={props.isMarketSelectorOpen}
            onClose={props.onClose}
            markets={props.markets}
            onSelect={props.onSelect}
            allPrices={props.allPrices}
            marketDataMap={props.marketDataMap}
            futuresDataMap={props.futuresDataMap}
            oraclePrices={props.oraclePrices}
            triggerRef={props.triggerRef}
          />
        </div>

        <div className="flex flex-col ">
          <span className="font-semibold font-mono md:text-lg text-base text-text-primary">
            {Number.isFinite(displayPrice) ? formatUsd(displayPrice as number) : '$--'}
          </span>
          {isCrypto && (
            <span
              className={`font-semibold font-mono md:text-sm text-xs ${
                isPositive ? 'text-success' : 'text-error'
              }`}
            >
              {props.marketData?.priceChangePercent
                ? `${isPositive ? '+' : ''}${parseFloat(
                    props.marketData.priceChangePercent,
                  ).toFixed(2)}%`
                : '--'}
            </span>
          )}
        </div>

        {isCrypto && (
          <>
            <div className="md:flex flex-col hidden">
              <span className="text-xs text-text-secondary">24H HIGH</span>
              <div className="flex items-center gap-1">
                <span className="text-success text-xs">▲</span>
                <span className="font-semibold font-mono text-sm text-text-primary">
                  {props.marketData?.high24h
                    ? formatPrice(parseFloat(props.marketData.high24h))
                    : '$--'}
                </span>
              </div>
            </div>

            <div className="md:flex flex-col hidden">
              <span className="text-xs text-text-secondary">24H LOW</span>
              <div className="flex items-center gap-1">
                <span className="text-error text-xs">▼</span>
                <span className="font-semibold font-mono text-sm text-text-primary">
                  {props.marketData?.low24h
                    ? formatPrice(parseFloat(props.marketData.low24h))
                    : '$--'}
                </span>
              </div>
            </div>

            <div className="md:flex flex-col hidden">
              <span className="text-xs text-text-secondary">24H VOLUME</span>
              <span className="font-semibold font-mono text-sm text-text-primary">
                {props.marketData?.volume24h
                  ? formatVolume(parseFloat(props.marketData.volume24h))
                  : '--'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Mobile: Info Button - Top Right Corner */}
      <button
        className="md:hidden absolute top-2 right-2 flex items-center justify-center p-2 bg-trading-surface rounded-lg hover:bg-trading-elevated transition-colors"
        onClick={() => {
          // Toggle mobile coin info panel with market data
          const event = new CustomEvent('toggleMobileCoinInfo', {
            detail: {
              marketData: {
                ...props.marketData,
                openInterestValue: props.futuresData?.openInterestValue,
              },
              activeMarket: props.activeMarket,
            },
          });
          window.dispatchEvent(event);
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
    </div>
  );
}
