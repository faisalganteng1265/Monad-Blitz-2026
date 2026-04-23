'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PositionRow from './PositionRow';
import MobilePositionCard from './MobilePositionCard';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Position } from '@/hooks/data/usePositions';

interface PositionsTableProps {
  positionIds: bigint[];
  isLoading: boolean;
  openPositionsCount: number;
  isClosing: boolean;
  selectedPositionId?: bigint;
  tpslRefreshTrigger: number;
  onClosePosition: (positionId: bigint, symbol: string) => void;
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
  onPositionLoaded: (
    positionId: bigint,
    isOpen: boolean,
    symbol: string,
    leverage?: number,
  ) => void;
  onCloseAll: () => void;
  filterPosition?: (position: Position) => boolean;
  emptyLabel?: string;
  onVisibleCountChange?: (count: number) => void;
  onVisibleIdsChange?: (ids: bigint[]) => void;
  showCloseAll?: boolean;
  hideSizeColumn?: boolean;
  hideLeverage?: boolean;
  hideTpSl?: boolean;
  lockedClosePrices?: Map<bigint, number>;
  closingPositionIds?: Set<bigint>;
}

const PositionsTable = ({
  positionIds,
  isLoading,
  openPositionsCount,
  isClosing,
  selectedPositionId,
  tpslRefreshTrigger,
  onClosePosition,
  onPositionClick,
  onTPSLClick,
  onPositionLoaded,
  onCloseAll,
  filterPosition,
  emptyLabel = 'No open positions',
  onVisibleCountChange,
  onVisibleIdsChange,
  showCloseAll = true,
  hideSizeColumn = false,
  hideLeverage = false,
  hideTpSl = false,
  lockedClosePrices,
  closingPositionIds,
}: PositionsTableProps) => {
  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'single' | 'all'>('single');
  const [targetPosition, setTargetPosition] = useState<{ id: bigint; symbol: string } | null>(null);
  const [visibilityMap, setVisibilityMap] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    setVisibilityMap(new Map());
  }, [positionIds.join(',')]);

  const handleVisibilityChange = useCallback((positionId: bigint, isVisible: boolean) => {
    setVisibilityMap((prev) => {
      const key = positionId.toString();
      if (prev.get(key) === isVisible) return prev;
      const next = new Map(prev);
      next.set(key, isVisible);
      return next;
    });
  }, []);

  const visibleCount = Array.from(visibilityMap.values()).filter(Boolean).length;
  const allReported = visibilityMap.size >= positionIds.length;

  useEffect(() => {
    if (allReported && onVisibleCountChange) {
      onVisibleCountChange(visibleCount);
    }
  }, [allReported, visibleCount, onVisibleCountChange]);

  const visibleIds = useMemo(
    () => positionIds.filter((id) => visibilityMap.get(id.toString())),
    [positionIds, visibilityMap],
  );

  useEffect(() => {
    if (allReported && onVisibleIdsChange) {
      onVisibleIdsChange(visibleIds);
    }
  }, [allReported, visibleIds, onVisibleIdsChange]);

  // Handle "Close" click on a single position
  const handleRequestClose = (positionId: bigint, symbol: string) => {
    setTargetPosition({ id: positionId, symbol });
    setActionType('single');
    setIsDialogOpen(true);
  };

  // Handle "Close All" click
  const handleRequestCloseAll = () => {
    setActionType('all');
    setIsDialogOpen(true);
  };

  // Confirm Action
  const handleConfirmClose = () => {
    if (actionType === 'all') {
      onCloseAll();
    } else if (targetPosition) {
      onClosePosition(targetPosition.id, targetPosition.symbol);
    }
    setIsDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-500 mb-4"></div>
        <span>Loading positions...</span>
      </div>
    );
  }

  if (positionIds.length === 0) {
    return <div className="text-center py-16 text-gray-500">{emptyLabel}</div>;
  }

  if (allReported && visibleCount === 0) {
    return <div className="text-center py-16 text-gray-500">{emptyLabel}</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Actions Bar for Desktop */}
      <div className="hidden md:flex justify-end p-2 border-b border-gray-800/50">
        {showCloseAll && openPositionsCount > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleRequestCloseAll}
            disabled={isClosing}
            className="h-7 text-xs font-bold"
          >
            Close All Positions
          </Button>
        )}
      </div>

      {/* Desktop View: Table */}
      <div className="hidden md:block overflow-x-auto custom-scrollbar">
        <Table>
          <TableHeader className="bg-[#0B1017] sticky top-0 z-10">
            <TableRow className="border-b border-gray-800 hover:bg-transparent">
              <TableHead className="font-medium min-w-[140px]">Position</TableHead>
              {!hideSizeColumn && <TableHead className="text-right font-medium">Size</TableHead>}
              <TableHead className="text-right font-medium">PnL (ROE%)</TableHead>
              <TableHead className="text-right font-medium">Collateral</TableHead>
              <TableHead className="text-right font-medium">Entry Price</TableHead>
              <TableHead className="text-right font-medium">Mark Price</TableHead>
              <TableHead className="text-right font-medium">Liq. Price</TableHead>
              {!hideTpSl && <TableHead className="text-right font-medium">TP / SL</TableHead>}
              <TableHead className="text-right font-medium w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positionIds.map((positionId) => (
              <PositionRow
                key={`${positionId.toString()}-${tpslRefreshTrigger}`}
                positionId={positionId}
                onClose={handleRequestClose}
                onPositionClick={onPositionClick}
                onTPSLClick={onTPSLClick}
                isSelected={selectedPositionId === positionId}
                onPositionLoaded={onPositionLoaded}
                filterPosition={filterPosition}
                onVisibilityChange={handleVisibilityChange}
                hideSize={hideSizeColumn}
                hideLeverage={hideLeverage}
                hideTpSl={hideTpSl}
                lockedClosePrice={lockedClosePrices?.get(positionId)}
                isCloseLocked={closingPositionIds?.has(positionId)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile View: Cards */}
      <div className="md:hidden space-y-4 flex-1 overflow-y-auto p-4">
        {showCloseAll && openPositionsCount > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleRequestCloseAll}
            disabled={isClosing}
            className="w-full mb-4 font-bold"
          >
            Close All Positions
          </Button>
        )}
        {positionIds.map((positionId) => (
          <MobilePositionCard
            key={`mobile-${positionId.toString()}-${tpslRefreshTrigger}`}
            positionId={positionId}
            onClose={handleRequestClose}
            onPositionClick={onPositionClick}
            onTPSLClick={onTPSLClick}
            onPositionLoaded={onPositionLoaded}
            filterPosition={filterPosition}
            onVisibilityChange={handleVisibilityChange}
            hideSize={hideSizeColumn}
            hideLeverage={hideLeverage}
            hideTpSl={hideTpSl}
            lockedClosePrice={lockedClosePrices?.get(positionId)}
            isCloseLocked={closingPositionIds?.has(positionId)}
          />
        ))}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent className="bg-[#131B26] border-gray-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'all' ? 'Close All Positions?' : 'Close Position?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              {actionType === 'all'
                ? 'Are you sure you want to close ALL open positions? This action cannot be undone.'
                : `Are you sure you want to close your ${targetPosition?.symbol} position at market price?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClose}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              Confirm Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PositionsTable;
