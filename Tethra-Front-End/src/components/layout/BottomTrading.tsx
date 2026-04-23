'use client';

import { useState, useCallback, useEffect } from 'react';
import { useUserPositions, Position } from '@/hooks/data/usePositions';
import { useGaslessClose } from '@/features/trading/hooks/useGaslessClose';
import { toast } from 'sonner';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import { getSignedPrice } from '@/lib/priceApi';
import TPSLModal from '@/features/trading/components/modals/TPSLModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PositionsTable from '@/features/trading/components/positions/PositionsTable';

// New Components & Hooks
import OpenOrdersTab from '@/features/trading/components/orders/OpenOrdersTab';
import OneTapProfitTab from '@/features/trading/components/orders/OneTapProfitTab';
import HistoryTab from '@/features/trading/components/orders/HistoryTab';
import { useTapToTradeOrders } from '@/features/trading/hooks/useTapToTradeOrders';
import { useUserPendingOrders } from '@/features/trading/hooks/useLimitOrder';
import { useBinaryOrders } from '@/features/trading/hooks/useBinaryOrders';

export default function BottomTrading() {
  const [nonQuickTapIds, setNonQuickTapIds] = useState<bigint[]>([]);
  const [quickTapIds, setQuickTapIds] = useState<bigint[]>([]);
  const [closingQuickTapIds, setClosingQuickTapIds] = useState<Set<bigint>>(new Set());
  const [lockedQuickTapPrices, setLockedQuickTapPrices] = useState<Map<bigint, number>>(
    new Map(),
  );
  const { positionIds, isLoading: isLoadingIds, refetch: refetchPositions } = useUserPositions();
  const { closePosition, isPending: isClosing } = useGaslessClose();
  const { setSelectedPosition, selectedPosition } = useMarket();

  // Counts for Tabs
  const { orders: limitOrders } = useUserPendingOrders();
  const { orders: tapOrders } = useTapToTradeOrders();
  const { orders: binaryOrders } = useBinaryOrders();

  const pendingTapCount = tapOrders.filter((o) => o.status === 'PENDING').length;
  const openOrdersCount = limitOrders.length + pendingTapCount;
  const activeBinaryCount = binaryOrders.filter((o) => o.status === 'ACTIVE').length;

  const isQuickTapPosition = useCallback((position: Position) => {
    return position.leverage === 1000n;
  }, []);

  const isNonQuickTapPosition = useCallback((position: Position) => {
    return position.leverage !== 1000n;
  }, []);

  useEffect(() => {
    setClosingQuickTapIds((prev) => {
      const next = new Set<bigint>();
      for (const id of prev) {
        if (quickTapIds.includes(id)) {
          next.add(id);
        }
      }
      return next;
    });

    setLockedQuickTapPrices((prev) => {
      const next = new Map<bigint, number>();
      for (const [id, price] of prev.entries()) {
        if (quickTapIds.includes(id)) {
          next.set(id, price);
        }
      }
      return next;
    });
  }, [quickTapIds]);

  // TP/SL Modal state
  const [tpslModalOpen, setTpslModalOpen] = useState(false);
  const [tpslModalData, setTpslModalData] = useState<{
    positionId: number;
    trader: string;
    symbol: string;
    entryPrice: number;
    isLong: boolean;
  } | null>(null);
  const [tpslRefreshTrigger, setTpslRefreshTrigger] = useState(0);

  // Map to store symbols for positions
  const [nonQuickTapSymbols, setNonQuickTapSymbols] = useState<Map<bigint, string>>(new Map());
  const [quickTapSymbols, setQuickTapSymbols] = useState<Map<bigint, string>>(new Map());

  const openPositionsCount = nonQuickTapIds.length;
  const quickTapPositionsCount = quickTapIds.length;

  const handleClosePosition = async (positionId: bigint, symbol: string) => {
    try {
      await closePosition({ positionId, symbol });
      setTimeout(() => refetchPositions?.(), 1000);
    } catch (error) {}
  };

  const lockQuickTapPrice = async (positionId: bigint, symbol: string) => {
    setClosingQuickTapIds((prev) => new Set(prev).add(positionId));
    const signed = await getSignedPrice(symbol);
    const lockedPrice = Number(signed.price) / 1e8;
    setLockedQuickTapPrices((prev) => {
      const next = new Map(prev);
      next.set(positionId, lockedPrice);
      return next;
    });
    return signed;
  };

  const handleQuickTapClose = async (positionId: bigint, symbol: string) => {
    try {
      const signedPrice = await lockQuickTapPrice(positionId, symbol);
      await closePosition({ positionId, symbol, signedPrice });
      setTimeout(() => refetchPositions?.(), 1000);
    } catch (error) {
      setClosingQuickTapIds((prev) => {
        const next = new Set(prev);
        next.delete(positionId);
        return next;
      });
      setLockedQuickTapPrices((prev) => {
        const next = new Map(prev);
        next.delete(positionId);
        return next;
      });
    }
  };

  const handlePositionClick = (
    positionId: bigint,
    symbol: string,
    entryPrice: number,
    isLong: boolean,
  ) => {
    setSelectedPosition({ positionId, symbol, entryPrice, isLong });
  };

  const handleTPSLModalOpen = (
    positionId: bigint,
    trader: string,
    symbol: string,
    entryPrice: number,
    isLong: boolean,
  ) => {
    setTpslModalData({
      positionId: Number(positionId),
      trader,
      symbol,
      entryPrice,
      isLong,
    });
    setTpslModalOpen(true);
  };

  const handleTPSLModalClose = (refresh: boolean) => {
    setTpslModalOpen(false);
    setTpslModalData(null);
    if (refresh) {
      setTpslRefreshTrigger((prev) => prev + 1);
    }
  };

  const handleNonQuickTapLoaded = useCallback(
    (positionId: bigint, _isOpen: boolean, symbol: string) => {
      setNonQuickTapSymbols((prev) => {
        if (prev.get(positionId) === symbol) return prev;
        const next = new Map(prev);
        next.set(positionId, symbol);
        return next;
      });
    },
    [],
  );

  const handleQuickTapLoaded = useCallback(
    (positionId: bigint, _isOpen: boolean, symbol: string) => {
      setQuickTapSymbols((prev) => {
        if (prev.get(positionId) === symbol) return prev;
        const next = new Map(prev);
        next.set(positionId, symbol);
        return next;
      });
    },
    [],
  );

  const executeCloseAll = async () => {
    if (nonQuickTapIds.length === 0) return;

    toast.loading(`Closing all positions...`, { id: 'close-all' });

    let successCount = 0;
    for (const id of nonQuickTapIds) {
      const symbol = nonQuickTapSymbols.get(id);
      if (symbol) {
        try {
          await closePosition({ positionId: id, symbol });
          successCount++;
        } catch (e) {}
      }
    }

    toast.dismiss('close-all');
    if (successCount > 0) {
      toast.success(`Closed ${successCount} positions!`);
      setTimeout(() => refetchPositions?.(), 2000);
    }
  };

  const executeCloseAllQuickTap = async () => {
    if (quickTapIds.length === 0) return;

    toast.loading(`Closing all quick tap positions...`, { id: 'close-all-quicktap' });
    setClosingQuickTapIds(new Set(quickTapIds));

    const signedBySymbol = new Map<string, Awaited<ReturnType<typeof getSignedPrice>>>();
    const lockedPrices = new Map<bigint, number>();

    const skippedIds: bigint[] = [];
    for (const id of quickTapIds) {
      const symbol = quickTapSymbols.get(id);
      if (!symbol) {
        skippedIds.push(id);
        continue;
      }
      if (!signedBySymbol.has(symbol)) {
        try {
          const signed = await getSignedPrice(symbol);
          signedBySymbol.set(symbol, signed);
        } catch (e) {
          skippedIds.push(id);
          continue;
        }
      }
      const signed = signedBySymbol.get(symbol);
      if (signed) {
        lockedPrices.set(id, Number(signed.price) / 1e8);
      } else {
        skippedIds.push(id);
      }
    }

    setLockedQuickTapPrices((prev) => {
      const next = new Map(prev);
      lockedPrices.forEach((value, key) => next.set(key, value));
      return next;
    });

    let successCount = 0;
    const failedIds: bigint[] = [];
    for (const id of quickTapIds) {
      const symbol = quickTapSymbols.get(id);
      if (!symbol) continue;
      const signed = signedBySymbol.get(symbol);
      if (!signed) continue;
      try {
        await closePosition({ positionId: id, symbol, signedPrice: signed });
        successCount++;
      } catch (e) {
        failedIds.push(id);
      }
    }

    toast.dismiss('close-all-quicktap');
    if (successCount > 0) {
      toast.success(`Closed ${successCount} quick tap positions!`);
      setTimeout(() => refetchPositions?.(), 2000);
    }

    const unlockIds = failedIds.concat(skippedIds);
    if (unlockIds.length > 0) {
      setClosingQuickTapIds((prev) => {
        const next = new Set(prev);
        unlockIds.forEach((id) => next.delete(id));
        return next;
      });
      setLockedQuickTapPrices((prev) => {
        const next = new Map(prev);
        unlockIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  return (
    <>
      <div className="bg-[#0B1017] rounded-lg h-full flex flex-col z-50 overflow-hidden">
        <Tabs defaultValue="positions" className="w-full h-full flex flex-col">
          <div className="flex items-center w-full border-b border-gray-800 bg-[#0B1017]">
            <TabsList className="bg-transparent h-12 w-full justify-start p-0 gap-2 md:gap-6 px-4 overflow-x-auto no-scrollbar flex-nowrap">
              <TabsTrigger
                value="positions"
                className="
                  data-[state=active]:bg-[#131B26]
                  data-[state=active]:shadow-none 
                  data-[state=active]:border-b-2 
                  data-[state=active]:border-b-[#3B82F6] 
                  data-[state=active]:text-white 
                  text-gray-400 
                  rounded-t-md
                  rounded-b-none 
                  h-full 
                  px-4
                  font-medium
                  hover:text-gray-300
                  hover:bg-white/5
                  transition-all
                  shrink-0
                "
              >
                <div className="flex items-center gap-2">
                  Positions
                  {openPositionsCount > 0 && (
                    <span className="flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-[#1E293B] text-gray-300 rounded px-1">
                      {openPositionsCount}
                    </span>
                  )}
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="openorders"
                className="
                  data-[state=active]:bg-[#131B26]
                  data-[state=active]:shadow-none 
                  data-[state=active]:border-b-2 
                  data-[state=active]:border-b-[#3B82F6] 
                  data-[state=active]:text-white 
                  text-gray-400 
                  rounded-t-md
                  rounded-b-none 
                  h-full 
                  px-4
                  font-medium
                  hover:text-gray-300
                  hover:bg-white/5
                  transition-all
                  shrink-0
                "
              >
                <div className="flex items-center gap-2">
                  Open Orders
                  {openOrdersCount > 0 && (
                    <span className="flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-[#1E293B] text-gray-300 rounded px-1">
                      {openOrdersCount}
                    </span>
                  )}
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="quicktap"
                className="
                  data-[state=active]:bg-[#131B26]
                  data-[state=active]:shadow-none 
                  data-[state=active]:border-b-2 
                  data-[state=active]:border-b-[#3B82F6] 
                  data-[state=active]:text-white 
                  text-gray-400 
                  rounded-t-md
                  rounded-b-none 
                  h-full 
                  px-4
                  font-medium
                  hover:text-gray-300
                  hover:bg-white/5
                  transition-all
                  shrink-0
                "
              >
                <div className="flex items-center gap-2">
                  Quick Tap
                  {quickTapPositionsCount > 0 && (
                    <span className="flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-[#1E293B] text-gray-300 rounded px-1">
                      {quickTapPositionsCount}
                    </span>
                  )}
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="onetap"
                className="
                  data-[state=active]:bg-[#131B26]
                  data-[state=active]:shadow-none 
                  data-[state=active]:border-b-2 
                  data-[state=active]:border-b-[#3B82F6] 
                  data-[state=active]:text-white 
                  text-gray-400 
                  rounded-t-md
                  rounded-b-none 
                  h-full 
                  px-4
                  font-medium
                  hover:text-gray-300
                  hover:bg-white/5
                  transition-all
                  shrink-0
                "
              >
                <div className="flex items-center gap-2">
                  One Tap Profit
                  {activeBinaryCount > 0 && (
                    <span className="flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-[#1E293B] text-gray-300 rounded px-1">
                      {activeBinaryCount}
                    </span>
                  )}
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="
                  data-[state=active]:bg-[#131B26]
                  data-[state=active]:shadow-none 
                  data-[state=active]:border-b-2 
                  data-[state=active]:border-b-[#3B82F6] 
                  data-[state=active]:text-white 
                  text-gray-400 
                  rounded-t-md
                  rounded-b-none 
                  h-full 
                  px-4
                  font-medium
                  hover:text-gray-300
                  hover:bg-white/5
                  transition-all
                  shrink-0
                "
              >
                <div>History</div>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden relative bg-[#0B1017]">
            <TabsContent
              value="positions"
              className="h-full m-0 data-[state=inactive]:hidden flex flex-col"
            >
              <PositionsTable
                positionIds={positionIds}
                isLoading={isLoadingIds}
                openPositionsCount={openPositionsCount}
                isClosing={isClosing}
                selectedPositionId={selectedPosition?.positionId}
                tpslRefreshTrigger={tpslRefreshTrigger}
                onClosePosition={handleClosePosition}
                onPositionClick={handlePositionClick}
                onTPSLClick={handleTPSLModalOpen}
                onPositionLoaded={handleNonQuickTapLoaded}
                onCloseAll={executeCloseAll}
                filterPosition={isNonQuickTapPosition}
                onVisibleIdsChange={setNonQuickTapIds}
              />
            </TabsContent>

            <TabsContent
              value="openorders"
              className="h-full m-0 data-[state=inactive]:hidden overflow-auto"
            >
              <OpenOrdersTab />
            </TabsContent>

            <TabsContent
              value="quicktap"
              className="h-full m-0 data-[state=inactive]:hidden overflow-auto"
            >
              <PositionsTable
                positionIds={positionIds}
                isLoading={isLoadingIds}
                openPositionsCount={quickTapPositionsCount}
                isClosing={isClosing}
                selectedPositionId={selectedPosition?.positionId}
                tpslRefreshTrigger={tpslRefreshTrigger}
                onClosePosition={handleQuickTapClose}
                onPositionClick={handlePositionClick}
                onTPSLClick={handleTPSLModalOpen}
                onPositionLoaded={handleQuickTapLoaded}
                onCloseAll={executeCloseAllQuickTap}
                filterPosition={isQuickTapPosition}
                emptyLabel="No quick tap positions"
                onVisibleIdsChange={setQuickTapIds}
                showCloseAll={true}
                hideSizeColumn={true}
                hideLeverage={true}
                hideTpSl={true}
                lockedClosePrices={lockedQuickTapPrices}
                closingPositionIds={closingQuickTapIds}
              />
            </TabsContent>

            <TabsContent
              value="onetap"
              className="h-full m-0 data-[state=inactive]:hidden overflow-auto"
            >
              <OneTapProfitTab />
            </TabsContent>

            <TabsContent
              value="history"
              className="h-full m-0 data-[state=inactive]:hidden overflow-auto"
            >
              <HistoryTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* TP/SL Modal */}
      {tpslModalOpen && tpslModalData && (
        <TPSLModal
          isOpen={tpslModalOpen}
          onClose={handleTPSLModalClose}
          positionId={tpslModalData.positionId}
          trader={tpslModalData.trader}
          symbol={tpslModalData.symbol}
          entryPrice={tpslModalData.entryPrice}
          isLong={tpslModalData.isLong}
        />
      )}
    </>
  );
}
