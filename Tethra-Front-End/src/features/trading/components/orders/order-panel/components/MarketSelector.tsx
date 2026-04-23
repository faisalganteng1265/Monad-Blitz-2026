'use client';

import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { ALL_MARKETS } from '@/features/trading/constants/markets';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import Image from 'next/image';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Market {
  symbol: string;
  tradingViewSymbol: string;
  logoUrl?: string;
  disabled?: boolean;
  binanceSymbol?: string;
  category?: 'crypto' | 'forex' | 'indices' | 'commodities' | 'stocks';
}

interface MarketSelectorProps {
  value?: Market;
  onSelect: (market: Market) => void;
  disabled?: boolean;
}

export const MarketSelector: React.FC<MarketSelectorProps> = ({ value, onSelect, disabled }) => {
  const [open, setOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const toggleFavorite = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setFavorites((prev) => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(symbol)) {
        newFavorites.delete(symbol);
      } else {
        newFavorites.add(symbol);
      }
      return newFavorites;
    });
  };

  // Sort markets: favorites first, then alphabetically
  const sortedMarkets = [...ALL_MARKETS].sort((a, b) => {
    const aIsFav = favorites.has(a.symbol);
    const bIsFav = favorites.has(b.symbol);
    if (aIsFav && !bIsFav) return -1;
    if (!aIsFav && bIsFav) return 1;
    return a.symbol.localeCompare(b.symbol);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          className={`w-full justify-between bg-trading-surface text-text-primary px-3 py-3 hover:bg-trading-surface hover:text-text-primary border border-border-default rounded-lg shadow-none h-auto ${
            disabled ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <div className="flex gap-3">
            <label className="text-xs text-text-secondary sblock">Market</label>
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 shrink-0 opacity-50"
            >
              <path
                d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.26618 11.9026 7.38064 11.95 7.49999 11.95C7.61933 11.95 7.73379 11.9026 7.81819 11.8182L10.0682 9.56819Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </div>

          {value ? (
            <div className="flex items-center gap-3">
              <Image
                src={value.logoUrl || '/icons/usdc.png'}
                alt={value.symbol}
                width={24}
                height={24}
                className="rounded-full"
              />
              <span className="text-lg text-text-primary">{formatMarketPair(value.symbol)}</span>
            </div>
          ) : (
            'Select market...'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] p-0 bg-trading-surface border-border-default"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command className="bg-trading-surface p-0">
          <CommandInput placeholder="Search market..." className="text-text-primary" />
          <CommandList>
            <CommandEmpty>No market found.</CommandEmpty>
            <CommandGroup>
              {sortedMarkets.map((market) => {
                const isFavorite = favorites.has(market.symbol);

                return (
                  <CommandItem
                    key={market.symbol}
                    value={market.symbol}
                    onSelect={() => {
                      onSelect(market);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between text-text-primary hover:bg-trading-elevated"
                  >
                    <div className="flex items-center gap-3">
                      <Image
                        src={market.logoUrl || '/icons/usdc.png'}
                        alt={market.symbol}
                        width={24}
                        height={24}
                        className="rounded-full"
                      />
                      <span className="text-lg">{formatMarketPair(market.symbol)}</span>
                    </div>
                    <button
                      onClick={(e) => toggleFavorite(market.symbol, e)}
                      className="p-1 hover:bg-trading-bg rounded transition-colors"
                    >
                      <Star
                        size={14}
                        className={cn(
                          'transition-colors',
                          isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-text-muted',
                        )}
                      />
                    </button>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export type { Market };
