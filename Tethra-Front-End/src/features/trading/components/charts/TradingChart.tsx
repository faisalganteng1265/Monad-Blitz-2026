'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';
import { Market } from '@/features/trading/types';
import { ALL_MARKETS } from '@/features/trading/constants/markets';
import { useMarketWebSocket } from '@/features/trading/hooks/useMarketWebSocket';
import TradingViewWidget from './TradingViewWidget';
import PerSecondChart from '@/components/charts/PerSecondChart';
import ChartHeader from './ChartHeader';
import { mergeMarketsWithOracle } from '@/features/trading/lib/marketUtils';
import { useOneTapProfit } from '@/features/trading/hooks/useOneTapProfitBetting';
import { useQuickTapSessionPnL } from '@/features/trading/hooks/useQuickTapSessionPnL';
import { formatDynamicUsd, formatMarketPair } from '@/features/trading/lib/marketUtils';
import Image from 'next/image';
import { useUSDCBalance } from '@/hooks/data/useUSDCBalance';
import { usePositionsByIds, useUserPositions } from '@/hooks/data/usePositions';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatUnits } from 'viem';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const TradingChart: React.FC = () => {
  const {
    activeMarket: contextActiveMarket,
    setActiveMarket,
    setCurrentPrice,
    timeframe,
  } = useMarket();

  const baseMarkets = useMemo<Market[]>(() => ALL_MARKETS, []);
  const [activeSymbol, setActiveSymbol] = useState<string>(
    contextActiveMarket?.symbol || baseMarkets[0].symbol,
  );
  const [isMarketSelectorOpen, setIsMarketSelectorOpen] = useState(false);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const pendingQuickTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevQuickTapCountRef = useRef<number>(0);

  const tapToTrade = useTapToTrade();
  const { placeBetWithSession, placeBetPrivate, isPlacingBet, activeBets, sessionPnL: oneTapSessionPnL } =
    useOneTapProfit();
  const { sessionPnL: quickTapSessionPnL } = useQuickTapSessionPnL({
    enabled: tapToTrade.isEnabled && tapToTrade.tradeMode === 'quick-tap',
  });
  const { usdcBalance } = useUSDCBalance();
  const isQuickTap = tapToTrade.tradeMode === 'quick-tap';
  const { positionIds } = useUserPositions();
  const { positions } = usePositionsByIds(positionIds);

  // Axis Configuration
  const [axisConfig, setAxisConfig] = useState({
    showX: true,
    showY: true,
    ySide: 'right' as 'left' | 'right',
  });

  // Set default axis side based on screen width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setAxisConfig((prev) => ({ ...prev, showX: false, showY: false }));
      } else {
        setAxisConfig((prev) => ({ ...prev, ySide: 'right' }));
      }
    };

    // Initial check
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { allPrices, marketDataMap, futuresDataMap, oraclePrices } =
    useMarketWebSocket(baseMarkets);

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
  const currentFuturesData = activeMarket?.binanceSymbol
    ? futuresDataMap[activeMarket.binanceSymbol]
    : null;
  const currentOraclePrice = activeMarket ? oraclePrices[activeMarket.symbol] : null;

  // Update context when market changes
  useEffect(() => {
    if (activeMarket) {
      setActiveMarket(activeMarket);
    }
  }, [activeMarket, setActiveMarket]);

  // Update context when price changes - prioritize Oracle price
  useEffect(() => {
    // Use Oracle price if available, fallback to Binance price
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
    setIsMarketSelectorOpen(false);
  };

  // derived values for minimal header
  const headerDisplayPrice =
    currentOraclePrice?.price ??
    (currentMarketData?.price ? parseFloat(currentMarketData.price) : 0);
  const headerPriceChange = currentMarketData?.priceChangePercent
    ? parseFloat(currentMarketData.priceChangePercent)
    : 0;
  const isHeaderPositive = headerPriceChange >= 0;

  const handleQuickTap = async (isLong: boolean) => {
    try {
      const pendingPrice = headerDisplayPrice || 0;
      if (pendingPrice > 0) {
        tapToTrade.setQuickTapPendingMarker({
          price: pendingPrice,
          isLong,
          createdAt: Date.now(),
        });
        if (pendingQuickTapTimeoutRef.current) {
          clearTimeout(pendingQuickTapTimeoutRef.current);
        }
        pendingQuickTapTimeoutRef.current = setTimeout(() => {
          tapToTrade.setQuickTapPendingMarker(null);
        }, 10000);
      }
      await tapToTrade.executeQuickTap(isLong);
      toast.success(isLong ? 'Quick tap long sent' : 'Quick tap short sent');
    } catch (error: any) {
      tapToTrade.setQuickTapPendingMarker(null);
      toast.error(error?.message || 'Quick tap failed');
    }
  };

  const quickTapPositionMarkers = useMemo(() => {
    if (!isQuickTap || !activeMarket || positions.length === 0) return [];

    return positions
      .filter(
        (position) =>
          position.status === 0 &&
          position.symbol === activeMarket.symbol &&
          position.leverage === 1000n,
      )
      .map((position) => ({
        id: position.id.toString(),
        entryPrice: parseFloat(formatUnits(position.entryPrice, 8)),
        isLong: position.isLong,
      }));
  }, [isQuickTap, activeMarket, positions]);

  const quickTapPendingMarkers = useMemo(() => {
    if (!isQuickTap || !tapToTrade.quickTapPendingMarker) return [];
    return [
      {
        id: `pending-${tapToTrade.quickTapPendingMarker.createdAt}`,
        entryPrice: tapToTrade.quickTapPendingMarker.price,
        isLong: tapToTrade.quickTapPendingMarker.isLong,
      },
    ];
  }, [isQuickTap, tapToTrade.quickTapPendingMarker]);

  useEffect(() => {
    if (!tapToTrade.quickTapPendingMarker) {
      prevQuickTapCountRef.current = quickTapPositionMarkers.length;
      return;
    }
    if (quickTapPositionMarkers.length > prevQuickTapCountRef.current) {
      tapToTrade.setQuickTapPendingMarker(null);
    }
    prevQuickTapCountRef.current = quickTapPositionMarkers.length;
  }, [quickTapPositionMarkers.length, tapToTrade, tapToTrade.quickTapPendingMarker]);

  useEffect(() => {
    return () => {
      if (pendingQuickTapTimeoutRef.current) {
        clearTimeout(pendingQuickTapTimeoutRef.current);
      }
    };
  }, []);

  const displaySessionPnL =
    tapToTrade.tradeMode === 'quick-tap' ? quickTapSessionPnL : oneTapSessionPnL;

  return (
    <div
      className="w-full h-[95vh] flex flex-col bg-trading-dark text-text-primary relative"
      style={{ borderRadius: '0.5rem' }}
    >
      {/* Header with market info and controls */}
      {!tapToTrade.isEnabled ? (
        <div
          style={{
            flexShrink: 0,
            flexGrow: 0,
            borderTopLeftRadius: '0.5rem',
            borderTopRightRadius: '0.5rem',
            position: 'relative',
            zIndex: 10,
          }}
        >
          <ChartHeader
            activeMarket={activeMarket}
            marketData={currentMarketData}
            futuresData={currentFuturesData}
            allPrices={allPrices}
            marketDataMap={marketDataMap}
            futuresDataMap={futuresDataMap}
            oraclePrice={currentOraclePrice}
            oraclePrices={oraclePrices}
            onSymbolChangeClick={() => setIsMarketSelectorOpen(!isMarketSelectorOpen)}
            isMarketSelectorOpen={isMarketSelectorOpen}
            onClose={() => setIsMarketSelectorOpen(false)}
            markets={markets}
            onSelect={handleMarketSelect}
            triggerRef={triggerButtonRef}
            disabled={tapToTrade.isEnabled}
          />
        </div>
      ) : (
        /* Distraction-Free Overlay (Header + PnL) */
        <>
          {/* Minimal Header */}
          <div className="flex items-start justify-between px-4 py-3 absolute top-0 left-0 right-0 z-20 pointer-events-none">
            {/* Left: Logo, Name & Balance */}
            <div className="flex flex-col gap-1 pointer-events-auto">
              <div className="flex items-center gap-3">
                {activeMarket && (
                  <Image
                    src={`${activeMarket.logoUrl || '/icons/usdc.png'}`}
                    alt={`${activeMarket.symbol}`}
                    width={26}
                    height={26}
                    className="w-8 h-8 rounded-full"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                    }}
                  />
                )}
                <span className="font-bold text-text-primary text-2xl">
                  {activeMarket ? formatMarketPair(activeMarket.symbol) : ''}
                </span>
              </div>

              {/* Wallet Balance */}
              <div className="flex flex-col gap-1 pt-3">
                <div className="flex gap-2">
                  <span className="text-background text-sm font-medium">Your Balance</span>
                  <button
                    className="w-5 h-5 rounded-full bg-primary hover:bg-primary-hover flex items-center justify-center text-white transition-colors"
                    onClick={() => {
                      /* TODO: Open deposit modal logic  */
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M5 1V9M1 5H9"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <span className="text-text-primary text-xl font-bold">${usdcBalance}</span>
              </div>
            </div>

            {/* Right: Price & Change + Settings */}
            <div className="flex flex-col items-end pointer-events-auto rounded-xl gap-2">
              <div className="flex flex-col items-end -mt-3 py-4 pl-6 rounded-bl-xl">
                <span className="font-mono font-bold text-2xl text-text-primary">
                  {formatDynamicUsd(headerDisplayPrice)}
                </span>
                <span
                  className={`font-mono text-base font-semibold ${
                    isHeaderPositive ? 'text-success' : 'text-error'
                  }`}
                >
                  {isHeaderPositive ? '+' : ''}
                  {headerPriceChange.toFixed(2)}%
                </span>
              </div>

              {/* Chart Settings Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-black/50 hover:bg-black text-text-secondary rounded-full"
                  >
                    <Settings2 size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 bg-zinc-950 border-zinc-800 text-slate-200"
                >
                  <DropdownMenuLabel>Chart Settings</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={axisConfig.showX}
                    onCheckedChange={(checked) =>
                      setAxisConfig((prev) => ({ ...prev, showX: checked }))
                    }
                  >
                    Show Time Axis (X)
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={axisConfig.showY}
                    onCheckedChange={(checked) =>
                      setAxisConfig((prev) => ({ ...prev, showY: checked }))
                    }
                  >
                    Show Price Axis (Y)
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Y-Axis Position</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setAxisConfig((prev) => ({ ...prev, ySide: 'left' }))}
                    className="flex justify-between"
                  >
                    Left {axisConfig.ySide === 'left' && '✓'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setAxisConfig((prev) => ({ ...prev, ySide: 'right' }))}
                    className="flex justify-between"
                  >
                    Right {axisConfig.ySide === 'right' && '✓'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Bottom Session PnL */}
          <div
            className={`absolute lg:bottom-1/10 bottom-20 px-4 py-2 rounded-full flex flex-col items-center gap-2 bg-transparent shadow-none z-10 transition-all duration-300 ${
              tapToTrade.tradeMode === 'one-tap-profit' ? 'pointer-events-none' : 'pointer-events-auto'
            } ${
              tapToTrade.tradeMode === 'one-tap-profit' || tapToTrade.tradeMode === 'quick-tap'
                ? 'left-1/2 -translate-x-1/2' // Center for Tap Profit and Quick Tap
                : 'left-4' // Left for Open Position
            }`}
          >
            <span className="text-lg font-medium text-text-secondary">Session PnL</span>
            <span
              className={`font-mono font-bold text-4xl ${
                displaySessionPnL >= 0 ? 'text-success' : 'text-error'
              }`}
            >
              {displaySessionPnL >= 0 ? '+' : ''}
              {formatDynamicUsd(displaySessionPnL)}
            </span>
            {isQuickTap && (
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => handleQuickTap(true)}
                  disabled={tapToTrade.isQuickTapExecuting}
                  className="px-6 py-2 rounded-full bg-long/80 hover:bg-long text-white font-semibold shadow-md transition-colors disabled:opacity-60"
                >
                  Long
                </button>
                <button
                  onClick={() => handleQuickTap(false)}
                  disabled={tapToTrade.isQuickTapExecuting}
                  className="px-6 py-2 rounded-full bg-short/80 hover:bg-short text-white font-semibold shadow-md transition-colors disabled:opacity-60"
                >
                  Short
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Chart container */}
      <div
        className="trading-chart-container w-full"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {activeMarket && (
          <>
            {tapToTrade.isEnabled && activeMarket?.binanceSymbol ? (
              <PerSecondChart
                key={`${activeMarket.symbol}-smooth-chart`}
                symbol={activeMarket.symbol}
                currentPrice={parseFloat(
                  currentOraclePrice?.price?.toString() || currentMarketData?.price || '0',
                )}
                betAmount={tapToTrade.betAmount}
                isBinaryTradingEnabled={tapToTrade.isBinaryTradingEnabled}
                isPlacingBet={isPlacingBet}
                logoUrl={activeMarket.logoUrl}
                activeBets={activeBets} // Pass active bets
                tradeMode={tapToTrade.tradeMode} // Pass tradeMode explicitly
                // Pass axis props
                yAxisSide={axisConfig.ySide}
                showXAxis={axisConfig.showX}
                showYAxis={axisConfig.showY}
                positionMarkers={quickTapPositionMarkers}
                pendingMarkers={quickTapPendingMarkers}
                {...(tapToTrade.tradeMode === 'open-position' && tapToTrade.gridSession
                  ? {
                      gridIntervalSeconds:
                        tapToTrade.gridSession.gridSizeX * tapToTrade.gridSession.timeframeSeconds,
                      gridPriceStep:
                        (parseFloat(tapToTrade.gridSession.referencePrice) / 100000000) *
                        (tapToTrade.gridSession.gridSizeYPercent / 10000),
                      gridAnchorPrice:
                        parseFloat(tapToTrade.gridSession.referencePrice) / 100000000,
                      gridAnchorTime: tapToTrade.gridSession.referenceTime,
                    }
                  : {})}
                onCellClick={
                  tapToTrade.tradeMode === 'quick-tap'
                    ? undefined
                    : (targetPrice, targetTime, entryPrice, entryTime) => {
                        if (tapToTrade.tradeMode === 'one-tap-profit') {
                          if (tapToTrade.isPrivateMode) {
                            // Private mode: commitment scheme via CRE
                            const isUp = targetPrice > entryPrice;
                            placeBetPrivate({
                              symbol: activeMarket.symbol,
                              betAmount: tapToTrade.betAmount || '10',
                              targetPrice: targetPrice.toString(),
                              targetTime: targetTime,
                              entryPrice: entryPrice.toString(),
                              entryTime: entryTime,
                              isUp,
                            });
                          } else {
                            // Public mode: session key
                            placeBetWithSession(
                              {
                                symbol: activeMarket.symbol,
                                betAmount: tapToTrade.betAmount || '10',
                                targetPrice: targetPrice.toString(),
                                targetTime: targetTime,
                                entryPrice: entryPrice.toString(),
                                entryTime: entryTime,
                              },
                              {
                                sessionKey: tapToTrade.sessionKey,
                                sessionSigner: tapToTrade.signWithSession,
                              },
                            );
                          }
                        } else if (tapToTrade.tradeMode === 'open-position' && tapToTrade.gridSession) {
                          // Open Position mode - map click to grid cell
                          const session = tapToTrade.gridSession;
                          const refPrice = parseFloat(session.referencePrice) / 100000000;
                          const gridPriceStep = refPrice * (session.gridSizeYPercent / 10000);
                          const gridInterval = session.gridSizeX * session.timeframeSeconds;

                          // Calculate cell indices
                          // Cell Y: How many steps from reference price?
                          // Note: targetPrice corresponds to the BOTTOM of the cell in PerSecondChart logic?
                          // No, PerSecondChart logic returns CENTER of cell now?
                          // Wait, I check PerSecondChart handleMouseUp:
                          // const targetPrice = gridBottomPrice + GRID_Y_DOLLARS / 2;
                          // So targetPrice is CENTER.

                          // We need to find the integer index.
                          // cellY = (center - ref) / step
                          // This will result in X.5.
                          // So math.floor(val) should give the index if positive?
                          // Let's use the bottom price explicitly if we can, but we receive targetPrice (center).
                          // Center = ref + cellY * step + step/2
                          // Center - ref = step * (cellY + 0.5)
                          // (Center - ref) / step = cellY + 0.5
                          // cellY = round((Center - ref) / step - 0.5)

                          const priceDiff = targetPrice - refPrice;
                          const cellY = Math.round(priceDiff / gridPriceStep - 0.5);

                          // Cell X: Time steps from reference time
                          // targetTime in PerSecondChart is END of cell.
                          // targetTime = start + duration
                          // start = ref + cellX * duration
                          // targetTime = ref + (cellX + 1) * duration
                          // (targetTime - ref) / duration = cellX + 1
                          // cellX = round((targetTime - ref) / duration - 1)

                          const timeDiff = targetTime - session.referenceTime;
                          const cellX = Math.round(timeDiff / gridInterval - 1);

                          tapToTrade.handleCellClick(cellX, cellY);
                        }
                      }
                }
              />
            ) : (
              <TradingViewWidget
                key={`${activeMarket.symbol}`}
                symbol={activeMarket.tradingViewSymbol}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TradingChart;
