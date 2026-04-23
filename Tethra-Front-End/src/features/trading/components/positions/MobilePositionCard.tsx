import React, { useEffect } from 'react';
import { usePosition, Position } from '@/hooks/data/usePositions';
import { usePrice } from '@/hooks/data/usePrices';
import { useTPSLContext } from '@/contexts/TPSLContext';
import { ALL_MARKETS } from '@/features/trading/constants/markets';
import { formatMarketPair } from '@/features/trading/lib/marketUtils';
import { formatUnits } from 'viem';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MobilePositionCardProps {
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
  onPositionLoaded?: (positionId: bigint, isOpen: boolean, symbol: string) => void;
  filterPosition?: (position: Position) => boolean;
  onVisibilityChange?: (positionId: bigint, isVisible: boolean) => void;
  hideSize?: boolean;
  hideLeverage?: boolean;
  hideTpSl?: boolean;
  lockedClosePrice?: number;
  isCloseLocked?: boolean;
}

const MobilePositionCard = ({
  positionId,
  onClose,
  onPositionClick,
  onTPSLClick,
  onPositionLoaded,
  filterPosition,
  onVisibilityChange,
  hideSize = false,
  hideLeverage = false,
  hideTpSl = false,
  lockedClosePrice,
  isCloseLocked = false,
}: MobilePositionCardProps) => {
  const { position, isLoading } = usePosition(positionId);
  const { price: priceData } = usePrice(position?.symbol);
  const livePrice = priceData?.price || null;

  const { getConfig } = useTPSLContext();
  const tpslConfig = position ? getConfig(Number(position.id)) : null;

  useEffect(() => {
    if (isLoading) return;

    if (!position) {
      onVisibilityChange?.(positionId, false);
      return;
    }

    const isOpen = position.status === 0;
    const passesFilter = filterPosition ? filterPosition(position) : true;
    const isVisible = isOpen && passesFilter;

    onVisibilityChange?.(positionId, isVisible);

    if (isVisible && onPositionLoaded) {
      onPositionLoaded(positionId, isOpen, position.symbol);
    }
  }, [isLoading, position, positionId, onPositionLoaded, filterPosition, onVisibilityChange]);

  const passesFilter = position && (filterPosition ? filterPosition(position) : true);

  if (isLoading || !position || position.status !== 0 || !passesFilter) {
    return null;
  }

  const entryPrice = parseFloat(formatUnits(position.entryPrice, 8));
  const collateral = parseFloat(formatUnits(position.collateral, 6));
  const size = parseFloat(formatUnits(position.size, 6));
  const leverage = Number(position.leverage);

  let unrealizedPnl = 0;
  let pnlPercentage = 0;
  const markPrice = lockedClosePrice ?? livePrice ?? entryPrice;

  if (markPrice && entryPrice > 0) {
    const priceDiff = position.isLong ? markPrice - entryPrice : entryPrice - markPrice;
    unrealizedPnl = (priceDiff / entryPrice) * size;
    pnlPercentage = (unrealizedPnl / collateral) * 100;
  }

  const liqPriceRatio = (collateral / size) * 0.9;
  const liquidationPrice = position.isLong
    ? entryPrice * (1 - liqPriceRatio)
    : entryPrice * (1 + liqPriceRatio);

  const pnlColor = unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400';

  const getMarketLogo = (symbol: string) => {
    const market = ALL_MARKETS.find((m) => m.symbol === symbol);
    return market?.logoUrl || '';
  };

  return (
    <div className="bg-[#131B26] p-4 rounded-lg border border-gray-800 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={getMarketLogo(position.symbol)}
            alt={position.symbol}
            className="w-8 h-8 rounded-full bg-slate-800 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base">
                {formatMarketPair(position.symbol)}
              </span>
              <span
                className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  position.isLong
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400'
                }`}
              >
                {position.isLong ? 'Long' : 'Short'}
              </span>
            </div>
            {!hideLeverage && <span className="text-xs text-gray-400">{leverage}x Leverage</span>}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${pnlColor}`}>
            {unrealizedPnl >= 0 ? '+' : ''}
            {unrealizedPnl.toFixed(2)}
          </div>
          <div className={`text-xs font-medium ${pnlColor}`}>
            ({pnlPercentage >= 0 ? '+' : ''}
            {pnlPercentage.toFixed(2)}%)
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
        {!hideSize && (
          <div className="flex justify-between">
            <span className="text-gray-500">Size</span>
            <span className="text-white font-medium">${size.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">Margin</span>
          <span className="text-white font-medium">${collateral.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Entry Price</span>
          <span className="text-white font-medium">${entryPrice.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Mark Price</span>
          <span className="text-white font-medium">${markPrice.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Liq. Price</span>
          <span className="text-orange-400 font-medium">${liquidationPrice.toLocaleString()}</span>
        </div>
      </div>

      {/* TP/SL Info */}
      {!hideTpSl && tpslConfig && (tpslConfig.takeProfit || tpslConfig.stopLoss) && (
        <div className="flex gap-4 text-xs pt-2 border-t border-gray-800/50">
          {tpslConfig.takeProfit && (
            <span className="text-emerald-400">
              TP: ${(Number(tpslConfig.takeProfit) / 1e8).toFixed(2)}
            </span>
          )}
          {tpslConfig.stopLoss && (
            <span className="text-red-400">
              SL: ${(Number(tpslConfig.stopLoss) / 1e8).toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className={`grid ${hideTpSl ? 'grid-cols-1' : 'grid-cols-2'} gap-3 pt-2`}>
        {!hideTpSl && (
          <Button
            variant="outline"
            size="sm"
            className="w-full bg-slate-800 border-slate-700 hover:bg-slate-700 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onTPSLClick(position.id, position.trader, position.symbol, entryPrice, position.isLong);
            }}
            disabled={isCloseLocked}
          >
            TP / SL
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          className="w-full text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onClose(position.id, position.symbol);
          }}
          disabled={isCloseLocked}
        >
          {isCloseLocked ? 'Closing...' : 'Close Position'}
        </Button>
      </div>
    </div>
  );
};

export default MobilePositionCard;
