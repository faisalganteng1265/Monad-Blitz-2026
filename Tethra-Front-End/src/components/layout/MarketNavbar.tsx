/* eslint-disable @next/next/no-img-element */
'use client';

import React from 'react';

export interface Market {
  symbol: string;
  logoUrl?: string;
}

export interface MarketData {
  price?: string;
  priceChangePercent?: string;
  high24h?: string;
  low24h?: string;
  volume24h?: string;
}

export interface FuturesData {
  fundingRate: string;
  nextFundingTime: number;
  openInterestValue: string;
}

export interface OraclePrice {
  price: number;
}

interface MarketNavbarProps {
  activeMarket: Market | null;
  marketData: MarketData | null;
  futuresData?: FuturesData | null;
  oraclePrice?: OraclePrice | null;
  onMarketClick?: () => void;
  showFullInfo?: boolean;
  isMarketSelectorOpen?: boolean;
  children?: React.ReactNode;
}

const formatPrice = (price: number): string => {
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  } else if (price >= 1) {
    return `$${price.toFixed(2)}`;
  } else if (price >= 0.01) {
    return `$${price.toFixed(4)}`;
  } else {
    return `$${price.toFixed(8)}`;
  }
};

const formatVolume = (volume: number): string => {
  if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
  if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
  if (volume >= 1e3) return `$${(volume / 1e3).toFixed(2)}K`;
  return `$${volume.toFixed(2)}`;
};

const formatFundingRate = (rate: number): string => {
  return `${(rate * 100).toFixed(4)}%`;
};

const formatTimeUntil = (timestamp: number): string => {
  const now = Date.now();
  const diff = timestamp - now;
  if (diff <= 0) return '0h 0m';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};

export default function MarketNavbar({
  activeMarket,
  marketData,
  futuresData,
  oraclePrice,
  onMarketClick,
  showFullInfo = true,
  isMarketSelectorOpen = false,
  children,
}: MarketNavbarProps) {
  const displayPrice = oraclePrice?.price || (marketData?.price ? parseFloat(marketData.price) : 0);
  const priceChangePercent = marketData?.priceChangePercent
    ? parseFloat(marketData.priceChangePercent)
    : 0;
  const isPositive = priceChangePercent >= 0;
  const fundingRate = futuresData ? parseFloat(futuresData.fundingRate) : 0;
  const isFundingPositive = fundingRate >= 0;

  return (
    <div
      className="hidden lg:flex items-center justify-between px-4 py-2 bg-[#0B1017] rounded-lg"
      style={{ flexShrink: 0, gap: '0.75rem' }}
    >
      <div className="flex items-center gap-6 flex-wrap">
        {/* Market Selector */}
        {activeMarket && (
          <div className="relative">
            <button
              onClick={onMarketClick}
              className="flex items-center gap-2 bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-sm font-bold text-slate-100 hover:from-slate-700 hover:to-slate-600 hover:border-slate-500 transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
            >
              <img
                src={activeMarket.logoUrl || '/icons/usdc.png'}
                alt={activeMarket.symbol}
                className="w-6 h-6 rounded-full bg-slate-700 ring-2 ring-slate-600"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.onerror = null;
                  target.style.visibility = 'hidden';
                }}
              />
              <span className="text-base">{activeMarket.symbol}/USD</span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${
                  isMarketSelectorOpen ? 'rotate-180' : ''
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
          </div>
        )}

        {/* Price and Change */}
        <div className="flex flex-col min-w-[130px]">
          <span className="font-semibold font-mono text-lg text-white">
            {displayPrice ? formatPrice(displayPrice) : '$--'}
          </span>
          <span
            className={`font-semibold font-mono text-sm ${
              isPositive ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {marketData?.priceChangePercent
              ? `${isPositive ? '+' : ''}${parseFloat(marketData.priceChangePercent).toFixed(2)}%`
              : '--'}
          </span>
        </div>

        {/* 24h Stats - Only if showFullInfo is true */}
        {showFullInfo && (
          <>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400">24H HIGH</span>
              <div className="flex items-center gap-1">
                <span className="text-green-400 text-xs">▲</span>
                <span className="font-semibold font-mono text-sm text-slate-200">
                  {marketData?.high24h ? formatPrice(parseFloat(marketData.high24h)) : '$--'}
                </span>
              </div>
            </div>

            <div className="flex flex-col">
              <span className="text-xs text-slate-400">24H LOW</span>
              <div className="flex items-center gap-1">
                <span className="text-red-400 text-xs">▼</span>
                <span className="font-semibold font-mono text-sm text-slate-200">
                  {marketData?.low24h ? formatPrice(parseFloat(marketData.low24h)) : '$--'}
                </span>
              </div>
            </div>

            <div className="flex flex-col">
              <span className="text-xs text-slate-400">24H VOLUME</span>
              <span className="font-semibold font-mono text-sm text-slate-200">
                {marketData?.volume24h ? formatVolume(parseFloat(marketData.volume24h)) : '--'}
              </span>
            </div>
          </>
        )}

        {/* Futures Data - Only if provided */}
        {futuresData && showFullInfo && (
          <>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400">FUNDING RATE</span>
              <div className="flex items-center gap-1">
                <span
                  className={`font-semibold font-mono text-sm ${
                    isFundingPositive ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {formatFundingRate(fundingRate)}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  / {formatTimeUntil(futuresData.nextFundingTime)}
                </span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400">OPEN INTEREST</span>
              <span className="font-semibold font-mono text-sm text-slate-200">
                {formatVolume(parseFloat(futuresData.openInterestValue))}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Custom children content (e.g., additional buttons, info) */}
      {children && <div className="flex items-center gap-4">{children}</div>}
    </div>
  );
}
