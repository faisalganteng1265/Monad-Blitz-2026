'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GridConfig } from '@/types/gridTrading';

interface CanvasGridOverlayProps {
  chartRef: React.MutableRefObject<any>;
  gridConfig: GridConfig;
  selectedCells: Set<string>;
  currentPrice: number;
  onCellClick: (cellId: string, price: number, isAbovePrice: boolean) => void;
  interval: string; // Timeframe from chart (e.g., "1", "5", "15", "60", "D")
}

const CanvasGridOverlay: React.FC<CanvasGridOverlayProps> = ({
  chartRef,
  gridConfig,
  selectedCells,
  currentPrice,
  onCellClick,
  interval,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Update canvas dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (canvasRef.current?.parentElement) {
        const parent = canvasRef.current.parentElement;
        setDimensions({
          width: parent.clientWidth,
          height: parent.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    const interval = setInterval(updateDimensions, 1000);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearInterval(interval);
    };
  }, []);

  // Helper function to convert chart coordinates to pixel coordinates
  const convertToPixel = useCallback(
    (dataIndex: number, price: number): { x: number; y: number } | null => {
      if (!chartRef.current) return null;

      try {
        const chart = chartRef.current;
        const point = chart.convertToPixel(
          { timestamp: 0, dataIndex, value: price },
          { paneId: 'candle_pane' },
        );

        return point ? { x: point.x, y: point.y } : null;
      } catch (error) {
        return null;
      }
    },
    [chartRef],
  );

  // Helper function to get visible range from chart
  const getVisibleRange = useCallback(() => {
    if (!chartRef.current) return null;

    try {
      const chart = chartRef.current;
      const visibleDataRange = chart.getVisibleDataRange();

      if (
        visibleDataRange &&
        visibleDataRange.from !== undefined &&
        visibleDataRange.to !== undefined
      ) {
        const dataList = chart.getDataList();
        const visibleData = dataList.slice(visibleDataRange.from, visibleDataRange.to + 1);

        if (visibleData.length > 0) {
          const prices = visibleData.flatMap((d: any) => [d.high, d.low]);
          return {
            from: visibleDataRange.from,
            to: visibleDataRange.to,
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices),
            dataList: visibleData,
          };
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting visible range:', error);
      return null;
    }
  }, [chartRef]);

  // Main drawing loop
  useEffect(() => {
    if (!gridConfig.enabled || !canvasRef.current || !chartRef.current || dimensions.width === 0) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawOverlay = () => {
      if (!canvas || !ctx) return;

      // Set canvas size
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        // Get visible range from klinescharts
        const visibleRange = getVisibleRange();
        if (!visibleRange) {
          animationFrameRef.current = requestAnimationFrame(drawOverlay);
          return;
        }

        // Calculate price step based on grid config
        const priceStep =
          gridConfig.priceGridType === 'percentage'
            ? currentPrice * (gridConfig.priceGridSize / 100)
            : gridConfig.priceGridSize;

        // Calculate visible price range with padding
        const priceRange = visibleRange.maxPrice - visibleRange.minPrice;
        const padding = priceRange * 0.1;
        const minPrice = visibleRange.minPrice - padding;
        const maxPrice = visibleRange.maxPrice + padding;

        // Find grid price levels in visible range
        const lowestLevel = Math.floor(minPrice / priceStep) * priceStep;
        const highestLevel = Math.ceil(maxPrice / priceStep) * priceStep;

        // Parse timeframe to determine time interval in minutes
        const getTimeframeMinutes = (tf: string): number => {
          if (tf === 'D') return 1440; // 1 day
          const num = parseInt(tf);
          return isNaN(num) ? 60 : num; // Default to 60 minutes if invalid
        };

        // Calculate how many candles per grid column based on timeMultiplier
        const candlesPerColumn = gridConfig.timeMultiplier;

        // Draw grid using chart coordinates
        for (let priceLevel = lowestLevel; priceLevel <= highestLevel; priceLevel += priceStep) {
          const priceBottom = priceLevel;
          const priceTop = priceLevel + priceStep;

          // Get Y coordinates from chart for both price levels
          const pointTop = convertToPixel(visibleRange.from, priceTop);
          const pointBottom = convertToPixel(visibleRange.from, priceBottom);

          if (!pointTop || !pointBottom) {
            continue;
          }

          const yTop = pointTop.y;
          const yBottom = pointBottom.y;
          const boxHeight = yBottom - yTop;

          // Skip if too small
          if (boxHeight < 2) continue;

          // Draw boxes based on timeMultiplier (e.g., every N candles = 1 grid column)
          let col = 0;
          for (
            let dataIndex = visibleRange.from;
            dataIndex <= visibleRange.to;
            dataIndex += candlesPerColumn
          ) {
            // Get X coordinate from chart (left and right edges)
            const pointLeft = convertToPixel(dataIndex, priceLevel);
            const pointRight = convertToPixel(
              Math.min(dataIndex + candlesPerColumn, visibleRange.to + 1),
              priceLevel,
            );

            if (!pointLeft || !pointRight) {
              col++;
              continue;
            }

            const x = pointLeft.x;
            const gridBoxWidth = pointRight.x - pointLeft.x;

            // Skip if too narrow
            if (gridBoxWidth < 1) {
              col++;
              continue;
            }

            // Generate cell ID
            const cellId = `cell-${Math.round(priceLevel)}-${col}`;
            const isAbovePrice = priceTop > currentPrice;
            const isSelected = selectedCells.has(cellId);
            const isHovered = hoveredCell === cellId;

            // Draw box
            if (isSelected) {
              // Selected box
              const color = isAbovePrice ? '#ef4444' : '#10b981';
              ctx.fillStyle = color + '40'; // 40 = 25% opacity
              ctx.fillRect(x, yTop, gridBoxWidth, boxHeight);
              ctx.strokeStyle = color;
              ctx.lineWidth = 2;
              ctx.strokeRect(x, yTop, gridBoxWidth, boxHeight);

              // Label (only draw if box is big enough)
              if (gridBoxWidth > 30 && boxHeight > 15) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 9px monospace';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                ctx.shadowBlur = 4;
                const label = isAbovePrice ? 'SELL' : 'BUY';
                const textWidth = ctx.measureText(label).width;
                ctx.fillText(label, x + (gridBoxWidth - textWidth) / 2, yTop + boxHeight / 2 + 3);
                ctx.shadowBlur = 0;
              }
            } else if (isHovered) {
              // Hovered box
              const color = isAbovePrice ? '#ef4444' : '#10b981';
              ctx.fillStyle = color + '20'; // 20 = 12% opacity
              ctx.fillRect(x, yTop, gridBoxWidth, boxHeight);
              ctx.strokeStyle = color + '60';
              ctx.lineWidth = 1;
              ctx.strokeRect(x, yTop, gridBoxWidth, boxHeight);
            } else {
              // Empty box - draw subtle grid lines
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
              ctx.lineWidth = 0.5;
              ctx.strokeRect(x, yTop, gridBoxWidth, boxHeight);
            }

            col++; // Increment column counter
          }
        }

        // Draw current price line using chart coordinates
        const priceLinePoint = convertToPixel(visibleRange.from, currentPrice);
        if (priceLinePoint) {
          const currentPriceY = priceLinePoint.y;
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(0, currentPriceY);
          ctx.lineTo(dimensions.width, currentPriceY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw current price label
          ctx.fillStyle = '#3b82f6';
          ctx.font = 'bold 11px monospace';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(`$${currentPrice.toFixed(2)}`, 5, currentPriceY - 5);
          ctx.shadowBlur = 0;
        }

        // Draw price labels on the right using chart coordinates
        if (gridConfig.showLabels) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '10px monospace';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 3;
          for (let priceLevel = lowestLevel; priceLevel <= highestLevel; priceLevel += priceStep) {
            const labelPoint = convertToPixel(visibleRange.to, priceLevel);
            if (labelPoint) {
              const labelText = `$${priceLevel.toFixed(2)}`;
              const textWidth = ctx.measureText(labelText).width;
              ctx.fillText(labelText, dimensions.width - textWidth - 5, labelPoint.y + 4);
            }
          }
          ctx.shadowBlur = 0;
        }
      } catch (error) {
        console.error('Error drawing grid overlay:', error);
      }

      animationFrameRef.current = requestAnimationFrame(drawOverlay);
    };

    drawOverlay();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    gridConfig,
    selectedCells,
    hoveredCell,
    currentPrice,
    dimensions,
    chartRef,
    convertToPixel,
    getVisibleRange,
    interval,
  ]);

  // Helper function to convert pixel coordinates back to chart coordinates
  const convertFromPixel = useCallback(
    (x: number, y: number): { dataIndex: number; price: number } | null => {
      if (!chartRef.current) return null;

      try {
        const chart = chartRef.current;
        const coordinate = chart.convertFromPixel({ x, y }, { paneId: 'candle_pane' });

        return coordinate ? { dataIndex: coordinate.dataIndex, price: coordinate.value } : null;
      } catch (error) {
        return null;
      }
    },
    [chartRef],
  );

  // Handle canvas click
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!gridConfig.enabled || !canvasRef.current || !chartRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Convert pixel coordinates to chart coordinates
      const chartCoords = convertFromPixel(x, y);
      if (!chartCoords) return;

      const visibleRange = getVisibleRange();
      if (!visibleRange) return;

      // Calculate price step
      const priceStep =
        gridConfig.priceGridType === 'percentage'
          ? currentPrice * (gridConfig.priceGridSize / 100)
          : gridConfig.priceGridSize;

      // Find the price level (snap to grid)
      const priceLevel = Math.floor(chartCoords.price / priceStep) * priceStep;
      const priceTop = priceLevel + priceStep;

      // Find the column based on timeMultiplier
      const candlesPerColumn = gridConfig.timeMultiplier;
      const relativeDataIndex = Math.floor(chartCoords.dataIndex) - visibleRange.from;
      const col = Math.floor(relativeDataIndex / candlesPerColumn);

      const cellId = `cell-${Math.round(priceLevel)}-${col}`;
      const isAbovePrice = priceTop > currentPrice;

      onCellClick(cellId, priceLevel, isAbovePrice);
    },
    [gridConfig, currentPrice, onCellClick, chartRef, convertFromPixel, getVisibleRange],
  );

  // Handle canvas hover
  const handleCanvasMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!gridConfig.enabled || !canvasRef.current || !chartRef.current) {
        setHoveredCell(null);
        return;
      }

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Convert pixel coordinates to chart coordinates
      const chartCoords = convertFromPixel(x, y);
      if (!chartCoords) {
        setHoveredCell(null);
        return;
      }

      const visibleRange = getVisibleRange();
      if (!visibleRange) {
        setHoveredCell(null);
        return;
      }

      // Calculate price step
      const priceStep =
        gridConfig.priceGridType === 'percentage'
          ? currentPrice * (gridConfig.priceGridSize / 100)
          : gridConfig.priceGridSize;

      // Find the price level (snap to grid)
      const priceLevel = Math.floor(chartCoords.price / priceStep) * priceStep;

      // Find the column based on timeMultiplier
      const candlesPerColumn = gridConfig.timeMultiplier;
      const relativeDataIndex = Math.floor(chartCoords.dataIndex) - visibleRange.from;
      const col = Math.floor(relativeDataIndex / candlesPerColumn);

      const cellId = `cell-${Math.round(priceLevel)}-${col}`;
      setHoveredCell(cellId);
    },
    [gridConfig, currentPrice, chartRef, convertFromPixel, getVisibleRange],
  );

  const handleCanvasLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  if (!gridConfig.enabled) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      onMouseMove={handleCanvasMove}
      onMouseLeave={handleCanvasLeave}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        pointerEvents: 'auto',
        zIndex: 10,
      }}
    />
  );
};

export default CanvasGridOverlay;
