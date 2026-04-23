'use client';

import React, { useEffect } from 'react';
import { usePosition, Position } from '@/hooks/data/usePositions';
import { usePrice } from '@/hooks/data/usePrices';
import { useTPSLContext } from '@/contexts/TPSLContext';
import { ALL_MARKETS } from '@/features/trading/constants/markets';
import { formatMarketPair, inferMarketCategory } from '@/features/trading/lib/marketUtils';
import { formatUnits } from 'viem';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TableRow, TableCell } from '@/components/ui/table';

interface PositionRowProps {
  positionId: bigint;
  onClose: (positionId: bigint, symbol: string) => void;
  onPositionClick: (
    positionId: bigint,
    symbol: string,
    entryPrice: number,
    isLong: boolean,
  ) => void;
  onTPSLClick: (
    positionId: bigint,
    trader: string,
    symbol: string,
    entryPrice: number,
    isLong: boolean,
  ) => void;
  isSelected: boolean;
  onPositionLoaded?: (
    positionId: bigint,
    isOpen: boolean,
    symbol: string,
    leverage: number,
  ) => void;
  filterPosition?: (position: Position) => boolean;
  onVisibilityChange?: (positionId: bigint, isVisible: boolean) => void;
  hideSize?: boolean;
  hideLeverage?: boolean;
  hideTpSl?: boolean;
  lockedClosePrice?: number;
  isCloseLocked?: boolean;
}

const PositionRow = ({
  positionId,
  onClose,
  onPositionClick,
  onTPSLClick,
  isSelected,
  onPositionLoaded,
  filterPosition,
  onVisibilityChange,
  hideSize = false,
  hideLeverage = false,
  hideTpSl = false,
  lockedClosePrice,
  isCloseLocked = false,
}: PositionRowProps) => {
  const { position, isLoading } = usePosition(positionId);

  // Use shared price hook
  const { price: priceData, isLoading: loadingPrice } = usePrice(position?.symbol);
  const livePrice = priceData?.price || null;

  // Fetch TP/SL config
  const { getConfig } = useTPSLContext();
  const tpslConfig = position ? getConfig(Number(position.id)) : null;

  // Report position status
  useEffect(() => {
    if (isLoading) return;

    if (!position) {
      onVisibilityChange?.(positionId, false);
      return;
    }

    const isOpen = position.status === 0;
    const leverage = Number(position.leverage);
    const passesFilter = filterPosition ? filterPosition(position) : true;
    const isVisible = isOpen && passesFilter;

    onVisibilityChange?.(positionId, isVisible);

    if (isVisible && onPositionLoaded) {
      onPositionLoaded(positionId, isOpen, position.symbol, leverage);
    }
  }, [isLoading, position, positionId, onPositionLoaded, filterPosition, onVisibilityChange]);

  if (isLoading) {
    const loadingColSpan = 8 + (hideSize ? 0 : 1) + (hideTpSl ? 0 : 1);
    return (
      <TableRow className="border-b border-gray-800 hover:bg-transparent">
        <TableCell colSpan={loadingColSpan} className="text-center py-4 text-gray-500">
          Loading...
        </TableCell>
      </TableRow>
    );
  }

  const passesFilter = position && (filterPosition ? filterPosition(position) : true);

  if (!position || position.status !== 0 || !passesFilter) {
    return null;
  }

  const entryPrice = parseFloat(formatUnits(position.entryPrice, 8));
  const collateral = parseFloat(formatUnits(position.collateral, 6));
  const size = parseFloat(formatUnits(position.size, 6));
  const leverage = Number(position.leverage);

  // Calculate unrealized PnL and net value
  let unrealizedPnl = 0;
  let pnlPercentage = 0;
  const effectivePrice = lockedClosePrice ?? livePrice ?? entryPrice;
  const markPrice = effectivePrice || entryPrice;

  if (effectivePrice && entryPrice > 0) {
    const priceDiff = position.isLong ? effectivePrice - entryPrice : entryPrice - effectivePrice;
    unrealizedPnl = (priceDiff / entryPrice) * size;
    pnlPercentage = (unrealizedPnl / collateral) * 100;
  }

  // Calculate liquidation price
  const liqPriceRatio = (collateral / size) * 0.9;
  const liquidationPrice = position.isLong
    ? entryPrice * (1 - liqPriceRatio)
    : entryPrice * (1 + liqPriceRatio);

  const pnlColor = unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400';

  // Get crypto logo
  const getMarketLogo = (symbol: string) => {
    const market = ALL_MARKETS.find((m) => m.symbol === symbol);
    return market?.logoUrl || '';
  };

  const marketCategory =
    ALL_MARKETS.find((m) => m.symbol === position.symbol)?.category ??
    inferMarketCategory(position.symbol);
  const priceDecimals = marketCategory === 'forex' ? 5 : 2;
  const formatPriceValue = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: priceDecimals,
      maximumFractionDigits: priceDecimals,
    });

  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    onPositionClick(position.id, position.symbol, entryPrice, position.isLong);
  };

  const handleTPSLClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTPSLClick(position.id, position.trader, position.symbol, entryPrice, position.isLong);
  };

  return (
    <TableRow
      onClick={handleRowClick}
      className={cn(
        'border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer group',
        isSelected && 'bg-blue-500/5',
      )}
    >
      {/* Position */}
      <TableCell className="py-4">
        <div className="flex items-center gap-3">
          <img
            src={getMarketLogo(position.symbol)}
            alt={position.symbol}
            className="w-8 h-8 rounded-full bg-slate-800 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
          <div className="flex flex-col">
            <span className="font-bold text-white">{formatMarketPair(position.symbol)}</span>
            <div className="flex items-center gap-1.5">
              {!hideLeverage && (
                <span className="text-xs font-semibold text-slate-400">{leverage}x</span>
              )}
              <span
                className={cn(
                  'text-xs font-semibold px-1.5 rounded-[3px] bg-opacity-20',
                  position.isLong
                    ? 'text-emerald-400 bg-emerald-400/10'
                    : 'text-red-400 bg-red-400/10',
                )}
              >
                {position.isLong ? 'Long' : 'Short'}
              </span>
            </div>
          </div>
        </div>
      </TableCell>

      {/* Size */}
      {!hideSize && (
        <TableCell className="text-right text-white font-medium">${size.toFixed(2)}</TableCell>
      )}

      {/* PnL (ROE%) */}
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className={cn('font-bold', pnlColor)}>
            {unrealizedPnl >= 0 ? '+' : ''}
            {unrealizedPnl.toFixed(2)}
          </span>
          <span className={cn('text-xs font-medium', pnlColor)}>
            {pnlPercentage >= 0 ? '+' : ''}
            {pnlPercentage.toFixed(2)}%
          </span>
        </div>
      </TableCell>

      {/* Collateral */}
      <TableCell className="text-right text-white font-medium">${collateral.toFixed(2)}</TableCell>

      {/* Entry Price */}
      <TableCell className="text-right text-white font-mono">
        ${formatPriceValue(entryPrice)}
      </TableCell>

      {/* Mark Price */}
      <TableCell className="text-right text-white font-mono">
        {loadingPrice && lockedClosePrice === undefined ? (
          <span className="text-slate-600">...</span>
        ) : (
          `$${formatPriceValue(markPrice)}`
        )}
      </TableCell>

      {/* Liq. Price */}
      <TableCell className="text-right text-orange-400 font-mono">
        ${formatPriceValue(liquidationPrice)}
      </TableCell>

      {/* TP / SL (Values) */}
      {!hideTpSl && (
        <TableCell className="text-right">
          {tpslConfig && (tpslConfig.takeProfit || tpslConfig.stopLoss) ? (
            <div className="flex flex-col items-end gap-1 text-xs font-medium">
              {tpslConfig.takeProfit && (
                <span className="text-emerald-400/90">
                  TP: ${(Number(tpslConfig.takeProfit) / 1e8).toFixed(2)}
                </span>
              )}
              {tpslConfig.stopLoss && (
                <span className="text-red-400/90">
                  SL: ${(Number(tpslConfig.stopLoss) / 1e8).toFixed(2)}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-600 text-xs">-</span>
          )}
        </TableCell>
      )}

      {/* Actions (Always Visible) */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {!hideTpSl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTPSLClick}
              className="h-7 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 hover:border-slate-600"
              disabled={isCloseLocked}
            >
              TP/SL
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onClose(position.id, position.symbol)}
            className="h-7 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-medium border border-red-500/20 hover:border-red-500/30"
            disabled={isCloseLocked}
          >
            {isCloseLocked ? 'Closing...' : 'Close'}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default PositionRow;
