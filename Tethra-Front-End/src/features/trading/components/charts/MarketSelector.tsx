'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FuturesData, Market, MarketData } from '@/features/trading/types';
import { formatVolume } from '@/features/trading/lib/formatters';
import { formatDynamicUsd, formatMarketPair } from '@/features/trading/lib/marketUtils';
import Image from 'next/image';
import { Search, Star, X, Coins, Banknote, LineChart, Gem, Building2 } from 'lucide-react';

interface MarketSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  markets: Market[];
  onSelect: (symbol: string) => void;
  allPrices: Record<string, string>;
  marketDataMap: Record<string, MarketData>;
  futuresDataMap: Record<string, FuturesData>;
  oraclePrices: Record<string, { price: number }>;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

type TabKey = 'starred' | Market['category'];

const CATEGORY_TABS: { id: TabKey; label: string; icon: React.ReactNode }[] = [
  { id: 'starred', label: 'Starred', icon: <Star size={14} /> },
  { id: 'crypto', label: 'Crypto', icon: <Coins size={14} /> },
  { id: 'forex', label: 'Forex', icon: <Banknote size={14} /> },
  { id: 'indices', label: 'Indices', icon: <LineChart size={14} /> },
  { id: 'commodities', label: 'Commodities', icon: <Gem size={14} /> },
  { id: 'stocks', label: 'Stocks', icon: <Building2 size={14} /> },
];

function MarketLogo({ market }: { market: Market }) {
  if (market.logoUrl) {
    return (
      <Image
        src={market.logoUrl}
        alt={market.symbol}
        width={24}
        height={24}
        className="w-6 h-6 rounded-full bg-trading-surface"
        onError={(e) => {
          const target = e.currentTarget;
          target.onerror = null;
          target.style.visibility = 'hidden';
        }}
      />
    );
  }

  const initials = (market.symbol || '?').slice(0, 3).toUpperCase();
  return (
    <div className="w-6 h-6 rounded-full bg-trading-elevated text-[11px] font-semibold text-center leading-6 text-text-primary">
      {initials}
    </div>
  );
}

export default function MarketSelector(props: MarketSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('crypto');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  // Load favorites from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('tethra_favorite_markets');
    if (stored) {
      try {
        setFavorites(new Set(JSON.parse(stored)));
      } catch {
        setFavorites(new Set());
      }
    }
  }, []);

  // Persist favorites
  useEffect(() => {
    localStorage.setItem('tethra_favorite_markets', JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const filteredMarkets = useMemo(() => {
    const matchesTab = (market: Market) => {
      if (activeTab === 'starred') return favorites.has(market.symbol);
      return market.category === activeTab;
    };

    const term = searchTerm.toLowerCase();
    const filtered = props.markets.filter(
      (m) =>
        matchesTab(m) &&
        (m.symbol.toLowerCase().includes(term) ||
          formatMarketPair(m.symbol).toLowerCase().includes(term)),
    );

    return filtered.sort((a, b) => {
      const aFav = favorites.has(a.symbol);
      const bFav = favorites.has(b.symbol);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
  }, [props.markets, favorites, activeTab, searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        (panelRef.current && panelRef.current.contains(target)) ||
        (props.triggerRef?.current && props.triggerRef.current.contains(target))
      ) {
        return;
      }
      props.onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [props]);

  if (!props.isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="absolute top-full mt-2 left-0 w-screen max-w-[95vw] lg:max-w-[900px] bg-trading-panel border border-border-default rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[520px]"
      style={{ zIndex: 9999 }}
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-muted bg-trading-elevated">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search markets"
            className="w-full pl-9 pr-3 py-2 bg-input-bg border border-input-border rounded-md text-sm text-text-primary placeholder-input-placeholder focus:outline-none focus:ring-1 focus:ring-border-focus"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={props.onClose}
          className="p-2 rounded-md hover:bg-trading-surface text-text-muted"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-trading-panel border-b border-border-muted">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-none items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all ${
              activeTab === tab.id
                ? 'bg-trading-elevated border-border-light text-text-primary shadow-sm'
                : 'bg-trading-surface border-border-muted text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-text-secondary bg-trading-elevated border-b border-border-default sticky top-0">
        <div className="col-span-5">Market</div>
        <div className="col-span-2 text-center">Lev.</div>
        <div className="col-span-3 text-right">Price</div>
        <div className="col-span-2 text-right">Change</div>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar-slate max-h-[360px]">
        {filteredMarkets.length > 0 ? (
          filteredMarkets.map((market) => {
            const oraclePrice = props.oraclePrices[market.symbol]?.price;
            const spotPrice = market.binanceSymbol
              ? parseFloat(props.allPrices[market.binanceSymbol] || '0')
              : undefined;
            const price = oraclePrice ?? spotPrice;

            const marketData = market.binanceSymbol
              ? props.marketDataMap[market.binanceSymbol]
              : undefined;
            const priceChangePercent = marketData?.priceChangePercent
              ? parseFloat(marketData.priceChangePercent)
              : undefined;
            const isPositive = (priceChangePercent || 0) >= 0;
            const formattedPrice = price ? formatDynamicUsd(price) : '--';

            return (
              <div
                key={market.symbol}
                onClick={() => {
                  props.onSelect(market.symbol);
                  props.onClose();
                }}
                className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm border-b border-border-muted hover:bg-trading-elevated cursor-pointer transition-colors"
              >
                <div className="col-span-5 flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(market.symbol);
                    }}
                    className="p-1 rounded-full hover:bg-trading-surface text-text-muted"
                    aria-label="Toggle favorite"
                  >
                    <Star
                      size={14}
                      className={`${
                        favorites.has(market.symbol) ? 'fill-yellow-400 text-yellow-400' : ''
                      }`}
                    />
                  </button>
                  <MarketLogo market={market} />
                  <div className="flex flex-col">
                    <span className="font-bold text-text-primary">
                      {formatMarketPair(market.symbol)}
                    </span>
                    <span className="text-[11px] text-text-secondary capitalize">
                      {market.category}
                    </span>
                  </div>
                </div>
                <div className="col-span-2 text-center">
                  <span className="px-2 py-1 rounded-full text-xs bg-trading-surface text-text-primary border border-border-muted">
                    {market.maxLeverage ? `${market.maxLeverage}x` : '—'}
                  </span>
                </div>
                <div className="col-span-3 text-right font-mono text-text-primary">
                  {formattedPrice}
                </div>
                <div className="col-span-2 text-right font-mono">
                  {priceChangePercent !== undefined ? (
                    <span className={isPositive ? 'text-success' : 'text-error'}>
                      {isPositive ? '+' : ''}
                      {priceChangePercent.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-text-muted">--</span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex justify-center items-center h-32 text-text-secondary">
            No markets found.
          </div>
        )}
      </div>
    </div>
  );
}
