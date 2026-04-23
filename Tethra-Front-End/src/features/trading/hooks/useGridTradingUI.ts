'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  GridConfig,
  GridCell,
  GridOrder,
  TapToTradeState,
  DEFAULT_GRID_CONFIG,
} from '@/types/gridTrading';

interface UseGridTradingProps {
  currentPrice: number;
  interval: string; // Timeframe interval (1, 5, 15, 60, 240, D)
}

export const useGridTrading = ({ currentPrice, interval }: UseGridTradingProps) => {
  const [gridConfig, setGridConfig] = useState<GridConfig>(DEFAULT_GRID_CONFIG);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [pendingOrders, setPendingOrders] = useState<GridOrder[]>([]);

  // Calculate grid price levels based on current price and config
  const calculatePriceLevels = useCallback(
    (numLevels: number = 20): number[] => {
      if (!currentPrice || currentPrice <= 0) return [];

      const levels: number[] = [];
      const { priceGridSize, priceGridType } = gridConfig;

      for (let i = -numLevels; i <= numLevels; i++) {
        let price: number;

        if (priceGridType === 'percentage') {
          // Percentage-based grid
          const percentChange = (priceGridSize / 100) * i;
          price = currentPrice * (1 + percentChange);
        } else {
          // Absolute value grid
          price = currentPrice + priceGridSize * i;
        }

        levels.push(price);
      }

      return levels.sort((a, b) => b - a); // Sort descending (highest to lowest)
    },
    [currentPrice, gridConfig],
  );

  // Get interval in milliseconds
  const getIntervalMs = useCallback((): number => {
    const map: Record<string, number> = {
      '1': 60 * 1000,
      '3': 3 * 60 * 1000,
      '5': 5 * 60 * 1000,
      '15': 15 * 60 * 1000,
      '30': 30 * 60 * 1000,
      '60': 60 * 60 * 1000,
      '120': 2 * 60 * 60 * 1000,
      '240': 4 * 60 * 60 * 1000,
      D: 24 * 60 * 60 * 1000,
      W: 7 * 24 * 60 * 60 * 1000,
    };
    return (map[interval] || 60 * 60 * 1000) * gridConfig.timeMultiplier;
  }, [interval, gridConfig.timeMultiplier]);

  // Calculate grid cells based on visible chart area
  const calculateGridCells = useCallback(
    (visibleCandles: Array<{ time: number; close: number }>, priceLevels: number[]): GridCell[] => {
      const cells: GridCell[] = [];
      const intervalMs = getIntervalMs();

      // For each visible time point (considering timeMultiplier)
      for (let i = 0; i < visibleCandles.length; i += gridConfig.timeMultiplier) {
        const candle = visibleCandles[i];

        // For each price level
        priceLevels.forEach((priceLevel, levelIndex) => {
          const cellId = `cell-${i}-${levelIndex}`;
          const isAboveCurrentPrice = priceLevel > currentPrice;

          cells.push({
            id: cellId,
            timeIndex: i,
            priceLevel,
            timestamp: candle.time,
            isAboveCurrentPrice,
          });
        });
      }

      return cells;
    },
    [currentPrice, getIntervalMs, gridConfig.timeMultiplier],
  );

  // Handle cell tap/click (simplified version)
  const handleCellTap = useCallback(
    (cellId: string, price: number, isAbovePrice: boolean) => {
      if (!gridConfig.enabled) return;

      setSelectedCells((prev) => {
        const newSet = new Set(prev);

        if (newSet.has(cellId)) {
          // Remove cell and cancel order if exists
          newSet.delete(cellId);
          setPendingOrders((orders) => orders.filter((o) => o.cellId !== cellId));
        } else {
          // Add cell and create order
          newSet.add(cellId);

          const orderType = isAbovePrice ? 'sell' : 'buy';
          const newOrder: GridOrder = {
            cellId,
            orderType,
            price,
            amount: 0, // Will be set by user or default
            timestamp: Date.now(),
            status: 'pending',
          };

          setPendingOrders((orders) => [...orders, newOrder]);
        }

        return newSet;
      });
    },
    [gridConfig.enabled],
  );

  // Update grid configuration
  const updateGridConfig = useCallback((updates: Partial<GridConfig>) => {
    setGridConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Toggle grid enabled state
  const toggleGrid = useCallback(() => {
    setGridConfig((prev) => ({ ...prev, enabled: !prev.enabled }));

    if (gridConfig.enabled) {
      // Disable grid - clear selections
      setSelectedCells(new Set());
      setPendingOrders([]);
    }
  }, [gridConfig.enabled]);

  // Clear all selected cells
  const clearAllCells = useCallback(() => {
    setSelectedCells(new Set());
    setPendingOrders([]);
  }, []);

  // Place orders (to be integrated with smart contract)
  const placeGridOrders = useCallback(async () => {
    // TODO: Integrate with smart contract to place orders
    // For now, just log
    pendingOrders.forEach((order) => {});
  }, [pendingOrders]);

  // Get statistics
  const stats = useMemo(() => {
    const buyOrders = pendingOrders.filter((o) => o.orderType === 'buy').length;
    const sellOrders = pendingOrders.filter((o) => o.orderType === 'sell').length;

    return {
      totalCells: selectedCells.size,
      buyOrders,
      sellOrders,
      totalOrders: pendingOrders.length,
    };
  }, [selectedCells, pendingOrders]);

  return {
    // State
    gridConfig,
    selectedCells,
    pendingOrders,
    stats,

    // Calculations
    calculatePriceLevels,
    calculateGridCells,
    getIntervalMs,

    // Actions
    handleCellTap,
    updateGridConfig,
    toggleGrid,
    clearAllCells,
    placeGridOrders,
  };
};
