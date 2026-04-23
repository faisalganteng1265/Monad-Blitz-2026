'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GridConfig, GridCell } from '@/types/gridTrading';

interface GridOverlayProps {
  chartRef: React.MutableRefObject<any>;
  gridConfig: GridConfig;
  selectedCells: Set<string>;
  currentPrice: number;
  onCellClick: (cell: GridCell) => void;
  interval: string;
}

const GridOverlay: React.FC<GridOverlayProps> = ({
  chartRef,
  gridConfig,
  selectedCells,
  currentPrice,
  onCellClick,
  interval,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [visibleRange, setVisibleRange] = useState<{
    from: number;
    to: number;
    minPrice: number;
    maxPrice: number;
  } | null>(null);

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (overlayRef.current) {
        const rect = overlayRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (overlayRef.current) {
      resizeObserver.observe(overlayRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateDimensions);
      resizeObserver.disconnect();
    };
  }, []);

  // Get visible range from klinecharts
  useEffect(() => {
    if (!chartRef.current || !gridConfig.enabled) return;

    const updateVisibleRange = () => {
      try {
        const chart = chartRef.current;
        const bounding = chart.convertToPixel({ timestamp: 0, dataIndex: 0 }, { paneId: 'candle_pane' });
        const visibleDataRange = chart.getVisibleDataRange();
        
        if (visibleDataRange && visibleDataRange.from !== undefined && visibleDataRange.to !== undefined) {
          const dataList = chart.getDataList();
          const visibleData = dataList.slice(visibleDataRange.from, visibleDataRange.to + 1);
          
          if (visibleData.length > 0) {
            const prices = visibleData.flatMap((d: any) => [d.high, d.low]);
            setVisibleRange({
              from: visibleDataRange.from,
              to: visibleDataRange.to,
              minPrice: Math.min(...prices),
              maxPrice: Math.max(...prices),
            });
          }
        }
      } catch (error) {
        console.error('Error getting visible range:', error);
      }
    };

    updateVisibleRange();

    // Update on chart scroll/zoom
    const intervalId = setInterval(updateVisibleRange, 200);

    return () => clearInterval(intervalId);
  }, [chartRef, gridConfig.enabled]);

  // Calculate grid cells
  const gridCells = useMemo(() => {
    if (!gridConfig.enabled || !visibleRange || !currentPrice) return [];

    const cells: GridCell[] = [];
    const { timeMultiplier, priceGridSize, priceGridType, showLabels } = gridConfig;

    // Calculate price levels
    const priceRange = visibleRange.maxPrice - visibleRange.minPrice;
    const padding = priceRange * 0.1;
    const minPrice = visibleRange.minPrice - padding;
    const maxPrice = visibleRange.maxPrice + padding;

    // Generate price levels
    const priceLevels: number[] = [];
    const numLevels = 40;
    
    for (let i = -numLevels / 2; i <= numLevels / 2; i++) {
      let price: number;
      
      if (priceGridType === 'percentage') {
        const percentChange = (priceGridSize / 100) * i;
        price = currentPrice * (1 + percentChange);
      } else {
        price = currentPrice + (priceGridSize * i);
      }
      
      if (price >= minPrice && price <= maxPrice) {
        priceLevels.push(price);
      }
    }

    // Calculate time grids based on visible range
    const visibleCandleCount = visibleRange.to - visibleRange.from;
    
    for (let i = visibleRange.from; i <= visibleRange.to; i += timeMultiplier) {
      priceLevels.forEach((priceLevel, levelIndex) => {
        const cellId = `cell-${i}-${levelIndex}`;
        const isAboveCurrentPrice = priceLevel > currentPrice;
        
        cells.push({
          id: cellId,
          timeIndex: i,
          priceLevel,
          timestamp: Date.now() + (i * 60000), // Approximate
          isAboveCurrentPrice,
        });
      });
    }

    return cells;
  }, [gridConfig, visibleRange, currentPrice]);

  // Convert chart coordinates to pixel coordinates
  const convertToPixel = (dataIndex: number, price: number): { x: number; y: number } | null => {
    if (!chartRef.current) return null;

    try {
      const chart = chartRef.current;
      const point = chart.convertToPixel(
        { timestamp: 0, dataIndex, value: price },
        { paneId: 'candle_pane' }
      );
      
      return point ? { x: point.x, y: point.y } : null;
    } catch (error) {
      return null;
    }
  };

  // Render grid lines and cells
  const renderGrid = () => {
    if (!gridConfig.enabled || !visibleRange || dimensions.width === 0) return null;

    const { timeMultiplier, showLabels } = gridConfig;
    
    // Group cells by price level for horizontal lines
    const cellsByPrice = new Map<number, GridCell[]>();
    gridCells.forEach(cell => {
      const existing = cellsByPrice.get(cell.priceLevel) || [];
      existing.push(cell);
      cellsByPrice.set(cell.priceLevel, existing);
    });

    // Group cells by time index for vertical lines
    const cellsByTime = new Map<number, GridCell[]>();
    gridCells.forEach(cell => {
      const existing = cellsByTime.get(cell.timeIndex) || [];
      existing.push(cell);
      cellsByTime.set(cell.timeIndex, existing);
    });

    return (
      <svg
        width={dimensions.width}
        height={dimensions.height}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      >
        {/* Horizontal grid lines (price levels) */}
        {Array.from(cellsByPrice.entries()).map(([priceLevel, cells]) => {
          const firstCell = cells[0];
          const lastCell = cells[cells.length - 1];
          
          const startPoint = convertToPixel(firstCell.timeIndex, priceLevel);
          const endPoint = convertToPixel(lastCell.timeIndex, priceLevel);
          
          if (!startPoint || !endPoint) return null;

          const isCurrentPrice = Math.abs(priceLevel - currentPrice) / currentPrice < 0.001;
          const color = isCurrentPrice ? '#3b82f6' : '#1e293b';
          const strokeWidth = isCurrentPrice ? 2 : 1;
          const opacity = isCurrentPrice ? 0.8 : 0.3;

          return (
            <g key={`h-line-${priceLevel}`}>
              <line
                x1={startPoint.x}
                y1={startPoint.y}
                x2={endPoint.x}
                y2={endPoint.y}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeOpacity={opacity}
                strokeDasharray={isCurrentPrice ? '0' : '4 4'}
              />
              {showLabels && (
                <text
                  x={endPoint.x + 5}
                  y={endPoint.y + 4}
                  fontSize="10"
                  fill={color}
                  fillOpacity={opacity}
                  style={{ pointerEvents: 'none' }}
                >
                  ${priceLevel.toFixed(2)}
                </text>
              )}
            </g>
          );
        })}

        {/* Vertical grid lines (time) */}
        {Array.from(cellsByTime.entries()).map(([timeIndex]) => {
          if (timeIndex % timeMultiplier !== 0) return null;

          const topPoint = convertToPixel(timeIndex, visibleRange.maxPrice);
          const bottomPoint = convertToPixel(timeIndex, visibleRange.minPrice);
          
          if (!topPoint || !bottomPoint) return null;

          return (
            <line
              key={`v-line-${timeIndex}`}
              x1={topPoint.x}
              y1={topPoint.y}
              x2={bottomPoint.x}
              y2={bottomPoint.y}
              stroke="#1e293b"
              strokeWidth={1}
              strokeOpacity={0.3}
              strokeDasharray="4 4"
            />
          );
        })}
      </svg>
    );
  };

  // Render interactive grid cells
  const renderGridCells = () => {
    if (!gridConfig.enabled || dimensions.width === 0) return null;

    const { timeMultiplier } = gridConfig;
    
    // Group cells into rectangles for better performance
    const cellRects: Array<{
      cell: GridCell;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    gridCells.forEach(cell => {
      const topLeft = convertToPixel(cell.timeIndex, cell.priceLevel);
      const bottomRight = convertToPixel(
        cell.timeIndex + timeMultiplier,
        cell.priceLevel - (gridConfig.priceGridType === 'percentage' 
          ? currentPrice * (gridConfig.priceGridSize / 100)
          : gridConfig.priceGridSize)
      );

      if (topLeft && bottomRight) {
        cellRects.push({
          cell,
          x: topLeft.x,
          y: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
        });
      }
    });

    return cellRects.map(({ cell, x, y, width, height }) => {
      const isSelected = selectedCells.has(cell.id);
      const isBuy = !cell.isAboveCurrentPrice;
      const color = isBuy ? '#10b981' : '#ef4444';

      return (
        <div
          key={cell.id}
          onClick={() => onCellClick(cell)}
          style={{
            position: 'absolute',
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
            backgroundColor: isSelected ? `${color}40` : 'transparent',
            border: isSelected ? `2px solid ${color}` : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            pointerEvents: 'auto',
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = `${color}20`;
              e.currentTarget.style.borderColor = `${color}60`;
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }
          }}
          title={`${isBuy ? 'Buy' : 'Sell'} @ $${cell.priceLevel.toFixed(2)}`}
        />
      );
    });
  };

  if (!gridConfig.enabled) return null;

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
      }}
    >
      {renderGrid()}
      {renderGridCells()}
    </div>
  );
};

export default GridOverlay;
