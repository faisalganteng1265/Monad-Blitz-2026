'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';
import { Market } from '@/features/trading/types';
import { ALL_MARKETS } from '@/features/trading/constants/markets';
import { useMarketWebSocket } from '@/features/trading/hooks/useMarketWebSocket';
import PerSecondChart from '@/components/charts/PerSecondChart';
import { mergeMarketsWithOracle } from '@/features/trading/lib/marketUtils';
import { useOneTapProfit } from '@/features/trading/hooks/useOneTapProfitBetting';
import { formatDynamicUsd, formatMarketPair } from '@/features/trading/lib/marketUtils';
import { useUSDCBalance } from '@/hooks/data/useUSDCBalance';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const TradingChart: React.FC = () => {
  const {
    activeMarket: contextActiveMarket,
    setActiveMarket,
    setCurrentPrice,
  } = useMarket();

  const baseMarkets = useMemo<Market[]>(() => ALL_MARKETS, []);
  const [activeSymbol, setActiveSymbol] = useState<string>(
    contextActiveMarket?.symbol || baseMarkets[0].symbol,
  );

  const tapToTrade = useTapToTrade();
  const { placeBet, isPlacingBet, activeBets, sessionPnL } = useOneTapProfit();
  const { usdcBalance } = useUSDCBalance();

  const { marketDataMap, oraclePrices } = useMarketWebSocket(baseMarkets);

  const oracleSymbolsKey = useMemo(
    () =>
      Object.keys(oraclePrices || {})
        .sort()
        .join('|'),
    [oraclePrices],
  );

  const markets = useMemo(
    () => mergeMarketsWithOracle(baseMarkets, Object.keys(oraclePrices || {})),
    [baseMarkets, oracleSymbolsKey],
  );

  useEffect(() => {
    if (contextActiveMarket && contextActiveMarket.symbol !== activeSymbol) {
      setActiveSymbol(contextActiveMarket.symbol);
    }
  }, [contextActiveMarket, activeSymbol]);

  const activeMarket = useMemo(
    () => markets.find((m) => m.symbol === activeSymbol) || markets[0],
    [markets, activeSymbol],
  );

  const currentMarketData = activeMarket?.binanceSymbol
    ? marketDataMap[activeMarket.binanceSymbol]
    : null;
  const currentOraclePrice = activeMarket ? oraclePrices[activeMarket.symbol] : null;

  useEffect(() => {
    if (activeMarket) setActiveMarket(activeMarket);
  }, [activeMarket, setActiveMarket]);

  useEffect(() => {
    if (currentOraclePrice?.price) {
      setCurrentPrice(currentOraclePrice.price.toString());
    } else if (currentMarketData?.price) {
      setCurrentPrice(currentMarketData.price);
    }
  }, [currentOraclePrice?.price, currentMarketData?.price, setCurrentPrice]);

  const handleMarketSelect = (symbol: string) => {
    const selectedMarket = markets.find((m) => m.symbol === symbol);
    if (selectedMarket) {
      setActiveSymbol(symbol);
      setActiveMarket(selectedMarket);
    }
  };

  const headerDisplayPrice =
    currentOraclePrice?.price ??
    (currentMarketData?.price ? parseFloat(currentMarketData.price) : 0);
  const headerPriceChange = currentMarketData?.priceChangePercent
    ? parseFloat(currentMarketData.priceChangePercent)
    : 0;
  const isHeaderPositive = headerPriceChange >= 0;

  const handleCellClick = async (
    targetPrice: number,
    targetTime: number,
    entryPrice: number,
    entryTime: number,
  ) => {
    if (!activeMarket) return;
    try {
      await placeBet({
        symbol: activeMarket.symbol,
        betAmount: tapToTrade.betAmount || '10',
        targetPrice: targetPrice.toString(),
        targetTime,
        entryPrice: entryPrice.toString(),
        entryTime,
      });
      toast.success('Bet placed!');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to place bet');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-trading-dark text-text-primary relative">
      <div className="flex items-start justify-between px-4 py-3 border-b border-border-muted">
        <div className="flex flex-col gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                {activeMarket && (
                  <Image
                    src={activeMarket.logoUrl || '/icons/usdc.png'}
                    alt={activeMarket.symbol}
                    width={28}
                    height={28}
                    className="rounded-full"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <span className="font-bold text-text-primary text-xl">
                  {activeMarket ? formatMarketPair(activeMarket.symbol) : ''}
                </span>
                <span className="text-text-secondary text-sm">▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="bg-zinc-950 border-zinc-800 text-slate-200 max-h-72 overflow-auto"
            >
              {markets.map((m) => (
                <DropdownMenuItem
                  key={m.symbol}
                  onClick={() => handleMarketSelect(m.symbol)}
                  className="flex items-center gap-2"
                >
                  <Image
                    src={m.logoUrl || '/icons/usdc.png'}
                    alt={m.symbol}
                    width={20}
                    height={20}
                    className="rounded-full"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <span>{formatMarketPair(m.symbol)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex gap-3 text-xs text-text-secondary pt-1">
            <span>Balance</span>
            <span className="font-semibold text-text-primary">${usdcBalance}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="font-mono font-bold text-2xl text-text-primary">
            {formatDynamicUsd(headerDisplayPrice)}
          </span>
          <span
            className={`font-mono text-sm font-semibold ${
              isHeaderPositive ? 'text-success' : 'text-error'
            }`}
          >
            {isHeaderPositive ? '+' : ''}
            {headerPriceChange.toFixed(2)}%
          </span>
          <span className="text-xs text-text-secondary pt-1">
            Session PnL:{' '}
            <span className={sessionPnL >= 0 ? 'text-success' : 'text-error'}>
              {sessionPnL >= 0 ? '+' : ''}
              {formatDynamicUsd(sessionPnL)}
            </span>
          </span>
        </div>
      </div>

      <div
        className="w-full flex-1"
        style={{ minHeight: 0, position: 'relative' }}
      >
        {activeMarket && (
          <PerSecondChart
            key={`${activeMarket.symbol}-chart`}
            symbol={activeMarket.symbol}
            currentPrice={parseFloat(
              currentOraclePrice?.price?.toString() || currentMarketData?.price || '0',
            )}
            betAmount={tapToTrade.betAmount}
            isBinaryTradingEnabled={true}
            isPlacingBet={isPlacingBet}
            logoUrl={activeMarket.logoUrl}
            activeBets={activeBets}
            tradeMode="one-tap-profit"
            showXAxis={true}
            showYAxis={true}
            yAxisSide="right"
            onCellClick={handleCellClick}
          />
        )}
      </div>
    </div>
  );
};

export default TradingChart;
