'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { pythDataFeed, Candle } from '@/app/services/pythDataFeed';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';
import { toast } from 'sonner';

interface SimpleLineChartProps {
  symbol: string;
  interval: string;
  currentPrice: number;
  tapToTradeEnabled: boolean;
  gridSize: number; // Grid size Y in percentage (e.g., 0.5 for 0.5%, 1 for 1%)
  onCellTap: (cellId: string, price: number, time: number, isBuy: boolean) => void;
}

interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

type ChartType = 'line' | 'candle';

const SimpleLineChart: React.FC<SimpleLineChartProps> = ({
  symbol,
  interval,
  currentPrice,
  tapToTradeEnabled,
  gridSize,
  onCellTap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  // Dynamic mobile check
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768,
  );
  const [visibleCandles, setVisibleCandles] = useState(isMobile ? 3 : 20); // Fewer candles on mobile = more zoomed in

  // Update mobile state on resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Update visibleCandles based on screen size
      setVisibleCandles(mobile ? 3 : 20);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [panOffset, setPanOffset] = useState(0); // Horizontal pan offset in pixels
  const [verticalPanOffset, setVerticalPanOffset] = useState(0); // Vertical pan offset in pixels
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null); // Mouse position for crosshair
  const [basePrice, setBasePrice] = useState<number>(0); // Base price for grid calculation (fixed reference)
  const [currentTime, setCurrentTime] = useState<number>(Date.now()); // Real-time clock for grid time calculation
  const [chartType, setChartType] = useState<ChartType>('line'); // Chart type: 'line' or 'candle'

  // Drag states (like PerSecondChart)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartPanOffset, setDragStartPanOffset] = useState(0);
  const [dragStartVerticalOffset, setDragStartVerticalOffset] = useState(0);
  const [hasMoved, setHasMoved] = useState(false); // Track if mouse has moved during drag

  // Quick Trade states
  const [quickTradeCollateral, setQuickTradeCollateral] = useState<string>('');
  const [quickTradeLeverage, setQuickTradeLeverage] = useState<string>('');

  // Get tap to trade context for gridSizeX
  const tapToTrade = useTapToTrade();

  // Update current time every second for real-time grid progression
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000); // Update every second

    return () => clearInterval(timeInterval);
  }, []);

  // Set base price when currentPrice is first available or when tap to trade is enabled
  useEffect(() => {
    if (currentPrice > 0 && basePrice === 0) {
      setBasePrice(currentPrice);
    }
  }, [currentPrice, basePrice]);

  // Handle keyboard reset (press C to center/reset)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C' || e.key === 'Home') {
        e.preventDefault();
        setPanOffset(0); // Reset to original position
        setVerticalPanOffset(0); // Reset vertical pan to default
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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

  // Fetch initial data and setup WebSocket
  useEffect(() => {
    let cleanupFn: (() => void) | null = null;

    const initializeData = async () => {
      try {
        const candles = await pythDataFeed.fetchCandles(symbol, interval, 100);

        const data: ChartData[] = candles.map((candle) => ({
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }));

        setChartData(data);

        // Setup WebSocket for real-time updates from Pyth Oracle
        if (wsRef.current) {
          wsRef.current.close();
        }

        const { ws, cleanup } = pythDataFeed.createWebSocket(symbol, interval, (candle: Candle) => {
          setChartData((prevData) => {
            const newData = [...prevData];
            const lastIndex = newData.length - 1;

            // Check if we should update last candle or add new one
            if (lastIndex >= 0 && newData[lastIndex].time === candle.time) {
              // Update existing candle with new OHLC data
              newData[lastIndex] = {
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
              };
            } else {
              // Add new candle
              newData.push({
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
              });
              // Keep only last 100 candles
              if (newData.length > 100) {
                newData.shift();
              }
            }

            return newData;
          });
        });

        wsRef.current = ws;
        cleanupFn = cleanup; // Store cleanup function
      } catch (error) {
        console.error('Error initializing chart:', error);
      }
    };

    initializeData();

    return () => {
      // Call cleanup function if it exists (to clear ping interval and close WebSocket)
      if (cleanupFn) {
        cleanupFn();
      } else if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, interval]);

  // Sync chartData with currentPrice from props for real-time updates
  // This ensures the blue line endpoint matches the green line and circle
  // Also handles creating new candles when timeframe window changes
  useEffect(() => {
    const latestPrice = currentPrice;

    if (latestPrice > 0 && chartData.length > 0) {
      setChartData((prevData) => {
        const newData = [...prevData];
        const lastIndex = newData.length - 1;

        if (lastIndex < 0) return newData;

        // Get interval in milliseconds
        const getIntervalMs = (int: string): number => {
          if (int === 'D') return 86400000; // 1 day
          const min = parseInt(int);
          return (isNaN(min) ? 60 : min) * 60 * 1000;
        };
        const intervalMs = getIntervalMs(interval);

        // Calculate which timeframe window currentTime belongs to
        // Round down to the start of the current window
        const currentWindow = Math.floor(currentTime / intervalMs) * intervalMs;
        const lastCandleWindow = Math.floor(newData[lastIndex].time / intervalMs) * intervalMs;

        // Check if we've moved to a new timeframe window
        if (currentWindow > lastCandleWindow) {
          // New window started - add new candle
          newData.push({
            time: currentWindow,
            open: latestPrice,
            high: latestPrice,
            low: latestPrice,
            close: latestPrice,
          });
          // Keep only last 100 candles
          if (newData.length > 100) {
            newData.shift();
          }
        } else {
          // Still in same window - update existing candle with real-time price
          // Only update if price has actually changed to avoid infinite loops
          if (Math.abs(newData[lastIndex].close - latestPrice) > 0.001) {
            newData[lastIndex] = {
              time: currentWindow, // Use window start time
              open: newData[lastIndex].open, // Keep original open
              high: Math.max(newData[lastIndex].high, latestPrice), // Update high
              low: Math.min(newData[lastIndex].low, latestPrice), // Update low
              close: latestPrice, // Update close to real-time price
            };
          }
        }

        return newData;
      });
    }
  }, [currentPrice, currentTime, interval]);

  // Drawing function
  useEffect(() => {
    if (!canvasRef.current || dimensions.width === 0 || chartData.length === 0) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Set canvas size
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Define margins for labels (right side for price, bottom for time)
      const rightMargin = isMobile ? 80 : 120; // Space for price labels on the right (smaller on mobile)
      const bottomMargin = 25; // Space for time labels at the bottom
      const chartWidth = canvas.width - rightMargin;
      const chartHeight = canvas.height - bottomMargin;

      // Draw black background for margin areas
      ctx.fillStyle = '#000000';
      // Right margin (for price labels)
      ctx.fillRect(chartWidth, 0, rightMargin, canvas.height);
      // Bottom margin (for time labels)
      ctx.fillRect(0, chartHeight, canvas.width, bottomMargin);

      // Calculate price range with zoom factor
      // Use high/low for accurate range in candlestick mode, close for line mode
      const prices =
        chartType === 'candle'
          ? chartData.flatMap((d) => [d.high, d.low])
          : chartData.map((d) => d.close);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice;
      const padding = priceRange * 0.1;

      // Calculate pixels per candle (needed for multiple calculations)
      const pixelsPerCandle = (chartWidth * 0.5) / visibleCandles;

      // Calculate price range based on grid settings to make square cells
      let chartMinPrice, chartMaxPrice, chartPriceRange;

      if (tapToTradeEnabled && basePrice > 0) {
        // User input grid step in dollars (Y axis)
        const gridStepDollar = (gridSize / 100) * basePrice;

        // Grid X width in pixels - ALWAYS based on 1 candle for perfect square
        // gridSizeX only affects click/hover area, not individual cell size
        const gridXWidthPixels = pixelsPerCandle; // 1 candle = 1 cell

        // For square cells: gridYHeightPixels should equal gridXWidthPixels
        // gridYHeightPixels = (gridStepDollar / chartPriceRange) * chartHeight
        // We want: gridYHeightPixels = gridXWidthPixels
        // So: (gridStepDollar / chartPriceRange) * chartHeight = gridXWidthPixels
        // Therefore: chartPriceRange = (gridStepDollar * chartHeight) / gridXWidthPixels
        chartPriceRange = (gridStepDollar * chartHeight) / gridXWidthPixels;

        // Center the price range around current price (or data range)
        const priceCenter = (minPrice + maxPrice) / 2;

        // Apply vertical pan offset (in pixels, converted to price)
        const pixelsPerPrice = chartHeight / chartPriceRange;
        const verticalShift = verticalPanOffset / pixelsPerPrice;

        chartMinPrice = priceCenter - chartPriceRange / 2 + verticalShift;
        chartMaxPrice = priceCenter + chartPriceRange / 2 + verticalShift;
      } else {
        // Normal mode - use data range
        const baseRange = priceRange + padding * 2;
        const pixelsPerPrice = chartHeight / baseRange;
        const verticalShift = verticalPanOffset / pixelsPerPrice;

        chartMinPrice = minPrice - padding + verticalShift;
        chartMaxPrice = maxPrice + padding + verticalShift;
        chartPriceRange = chartMaxPrice - chartMinPrice;
      }

      // Helper function to convert price to Y coordinate
      const priceToY = (price: number): number => {
        return chartHeight - ((price - chartMinPrice) / chartPriceRange) * chartHeight;
      };

      // Helper function to convert time to X coordinate
      // NOW line position - centered for better visibility
      const nowX = chartWidth * 0.5; // 50% - center of chart area (not including margin)
      const latestDataIndex = chartData.length - 1;

      const timeToX = (index: number): number => {
        // panOffset is now in pixels, so subtract it directly
        const candleOffset = index - latestDataIndex;
        return nowX + candleOffset * pixelsPerCandle - panOffset;
      };

      // Calculate how many future candles can fit on right side
      const rightSideWidth = chartWidth - nowX;
      const maxFutureCandles = Math.ceil(rightSideWidth / pixelsPerCandle) + 5; // +5 for safety margin

      // Draw horizontal grid lines (price levels) - using user input percentage
      if (tapToTradeEnabled && basePrice > 0) {
        // Use user input percentage for grid Y
        const gridStepDollar = (gridSize / 100) * basePrice;

        // Find the lowest and highest grid levels based on current price
        const lowestLevel = Math.floor(chartMinPrice / gridStepDollar) * gridStepDollar;
        const highestLevel = Math.ceil(chartMaxPrice / gridStepDollar) * gridStepDollar;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);

        for (let price = lowestLevel; price <= highestLevel; price += gridStepDollar) {
          const y = priceToY(price);
          if (y >= -10 && y <= chartHeight + 10) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(chartWidth, y);
            ctx.stroke();

            // Draw price label with percentage difference in the right margin
            const percentDiff = ((price - currentPrice) / currentPrice) * 100;
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px monospace';
            ctx.fillText(
              `$${price.toFixed(2)} (${percentDiff >= 0 ? '+' : ''}${percentDiff.toFixed(1)}%)`,
              chartWidth + 5,
              y - 2,
            );
          }
        }
        ctx.setLineDash([]);
      }

      // Draw vertical grid lines (time) - including future area
      // Grid lines should be drawn EVERY candle, not every gridSizeX
      if (tapToTradeEnabled) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);

        // Calculate visible range considering pan offset
        const totalVisibleCandles = Math.ceil(chartWidth / pixelsPerCandle);
        const panOffsetInCandles = panOffset / pixelsPerCandle;

        // Start from further left to account for pan
        const startIndex = Math.floor(-totalVisibleCandles - panOffsetInCandles);
        const endIndex = Math.ceil(chartData.length + maxFutureCandles);

        // Draw grid lines EVERY candle (not every gridSizeX)
        for (let i = startIndex; i < endIndex; i++) {
          const x = timeToX(i);
          // Only draw if within visible area
          if (x >= -10 && x <= chartWidth + 10) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, chartHeight);
            ctx.stroke();
          }
        }

        // Reset line dash to solid for other drawings
        ctx.setLineDash([]);
      }

      // Draw grid cells (tap areas) - including future area
      if (tapToTradeEnabled && basePrice > 0) {
        const gridSizeX = tapToTrade.gridSizeX || 1;

        // Use user input percentage for grid Y (same as horizontal lines)
        const gridStepDollar = (gridSize / 100) * basePrice;

        const lowestLevel = Math.floor(chartMinPrice / gridStepDollar) * gridStepDollar;
        const highestLevel = Math.ceil(chartMaxPrice / gridStepDollar) * gridStepDollar;

        // Calculate starting grid level index (relative to price 0)
        const startGridLevel = Math.floor(lowestLevel / gridStepDollar);
        const endGridLevel = Math.ceil(highestLevel / gridStepDollar);

        // Track hovered cell during drawing
        let currentHoveredCell: string | null = null;

        for (let priceLevel = startGridLevel; priceLevel <= endGridLevel; priceLevel++) {
          const price = priceLevel * gridStepDollar;
          const yTop = priceToY(price + gridStepDollar);
          const yBottom = priceToY(price);
          const boxHeight = Math.abs(yBottom - yTop);

          // Calculate total range including future - extend to canvas edge
          const totalRange = chartData.length + maxFutureCandles;

          // Draw boxes EVERY candle (not every gridSizeX) for perfect squares
          for (let i = 0; i < totalRange; i++) {
            const xLeft = timeToX(i);
            const xRight = timeToX(i + 1); // Each cell is exactly 1 candle wide
            const boxWidth = xRight - xLeft;

            if (xLeft > chartWidth) break; // Stop if beyond chart area
            if (xLeft < 0 || boxWidth < 0.5) continue; // Allow smaller cells for zoom

            // Calculate timestamp for this grid cell (use real-time as reference)
            const isFutureCell = i >= chartData.length;
            let gridTime: number;

            const getIntervalMs = (int: string) => {
              if (int === 'D') return 86400000;
              const min = parseInt(int);
              return (isNaN(min) ? 60 : min) * 60 * 1000;
            };
            const intervalMs = getIntervalMs(interval);

            if (isFutureCell) {
              // Future: estimate time based on current real-time + interval
              const futureOffset = (i - chartData.length + 1) * intervalMs;
              gridTime = currentTime + futureOffset;
            } else {
              // Past/present: calculate time based on current time minus offset
              const pastOffset = (chartData.length - 1 - i) * intervalMs;
              gridTime = currentTime - pastOffset;
            }

            // Convert to cellX, cellY coordinates (same format as TapToTradeContext)
            // Round to base interval (NOT gridSizeX interval) - each candle stays its base timeframe
            const gridTimeRounded = Math.floor(gridTime / intervalMs) * intervalMs;

            // Calculate cellX (time column index)
            const gridSession = tapToTrade.gridSession;
            let cellX = 0;
            let cellY = 0;

            if (gridSession) {
              const timeSeconds = Math.floor(gridTimeRounded / 1000);
              const referenceTime = gridSession.referenceTime;
              const columnDurationSeconds = Math.max(
                1,
                gridSession.gridSizeX * gridSession.timeframeSeconds,
              );
              cellX = Math.floor((timeSeconds - referenceTime) / columnDurationSeconds);

              // Calculate cellY as RELATIVE offset from reference price
              const referencePrice = parseFloat(gridSession.referencePrice) / 100000000;
              const gridStepDollar = (gridSize / 100) * referencePrice;
              const referencePriceLevel = Math.floor(referencePrice / gridStepDollar);
              cellY = priceLevel - referencePriceLevel; // Relative offset
            } else {
              // Fallback if no grid session
              cellY = priceLevel;
            }

            // Use same cellId format as TapToTradeContext: "cellX,cellY"
            const cellId = `${cellX},${cellY}`;

            // Check if mouse is hovering over this cell
            if (
              mousePosition &&
              mousePosition.x >= xLeft &&
              mousePosition.x <= xRight &&
              mousePosition.y >= yTop &&
              mousePosition.y <= yBottom &&
              mousePosition.x <= chartWidth &&
              mousePosition.y <= chartHeight
            ) {
              currentHoveredCell = cellId;
            }

            // Check if this cell has orders from TapToTradeContext
            const cellOrderInfo = tapToTrade.cellOrders.get(cellId);
            const hasOrders = cellOrderInfo && cellOrderInfo.orderCount > 0;
            const isHovered = hoveredCell === cellId;

            // Determine buy/sell based on cell order info or price position
            // LONG (green): price below reference = buy low, sell high
            // SHORT (red): price above reference = sell high, buy low
            const isBuy = hasOrders
              ? cellOrderInfo.isLong // Use order direction if exists
              : cellY < 0; // Below reference (cellY negative) = LONG = green

            const isFuture = i >= chartData.length;

            if (hasOrders) {
              // Selected cell - green if below current price (BUY), red if above (SELL)
              // Adjust line width based on cell size (both width and height)
              const minDimension = Math.min(boxWidth, boxHeight);
              const lineWidth = Math.max(0.5, Math.min(2, minDimension / 5));

              if (isBuy) {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.5)'; // Green with 50% opacity (more visible)
                ctx.fillRect(xLeft, yTop, boxWidth, boxHeight);

                // Only draw border if cell is large enough
                if (minDimension > 2) {
                  ctx.strokeStyle = 'rgba(16, 185, 129, 0.9)';
                  ctx.lineWidth = lineWidth;
                  ctx.strokeRect(xLeft, yTop, boxWidth, boxHeight);
                }
              } else {
                ctx.fillStyle = 'rgba(239, 68, 68, 0.5)'; // Red with 50% opacity (more visible)
                ctx.fillRect(xLeft, yTop, boxWidth, boxHeight);

                // Only draw border if cell is large enough
                if (minDimension > 2) {
                  ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
                  ctx.lineWidth = lineWidth;
                  ctx.strokeRect(xLeft, yTop, boxWidth, boxHeight);
                }
              }
            } else if (isHovered) {
              // Hovered cell - green if below current price (BUY), red if above (SELL)
              const color = isBuy ? '#10b981' : '#ef4444';
              ctx.fillStyle = color + '30';
              ctx.fillRect(xLeft, yTop, boxWidth, boxHeight);
            } else if (isFuture) {
              // Future area - slight background tint
              ctx.fillStyle = 'rgba(100, 100, 150, 0.02)';
              ctx.fillRect(xLeft, yTop, boxWidth, boxHeight);
            }
          }
        }

        // Update hovered cell state if changed
        if (currentHoveredCell !== hoveredCell) {
          setHoveredCell(currentHoveredCell);
        }
      }

      // Draw time labels below grid columns (including future) - with dynamic grouping based on zoom
      if (tapToTradeEnabled) {
        const gridSizeX = tapToTrade.gridSizeX;

        // Parse interval to get minutes
        const getIntervalMinutes = (intervalStr: string): number => {
          if (intervalStr === 'D') return 1440;
          const num = parseInt(intervalStr);
          return isNaN(num) ? 60 : num;
        };

        const intervalMinutes = getIntervalMinutes(interval);
        const minutesPerColumn = intervalMinutes * gridSizeX;
        const totalRange = chartData.length + maxFutureCandles;

        ctx.font = '10px monospace';

        // Determine label grouping based on visible candles (zoom level)
        // More visible candles = zoomed out = need more grouping
        let labelGroupMinutes: number;
        if (visibleCandles >= 100) {
          // Very zoomed out
          labelGroupMinutes = 60; // 1 hour
        } else if (visibleCandles >= 70) {
          labelGroupMinutes = 45; // 45 minutes
        } else if (visibleCandles >= 50) {
          labelGroupMinutes = 30; // 30 minutes
        } else if (visibleCandles >= 30) {
          labelGroupMinutes = 15; // 15 minutes
        } else if (visibleCandles >= 20) {
          labelGroupMinutes = 5; // 5 minutes
        } else if (visibleCandles >= 5) {
          // Mobile zoomed in (3-5 visible candles)
          labelGroupMinutes = Math.max(1, intervalMinutes); // Show every 1 minute for 1m interval
        } else {
          // Very zoomed in - show every interval
          labelGroupMinutes = intervalMinutes;
        }

        // Calculate how many columns to skip between labels
        const columnsPerLabel = Math.max(1, Math.ceil(labelGroupMinutes / minutesPerColumn));

        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 3;

        // Draw time labels with grouping
        for (let i = 0; i < totalRange; i += gridSizeX) {
          const xLeft = timeToX(i);
          const xRight = timeToX(Math.min(i + gridSizeX, totalRange));
          const xCenter = (xLeft + xRight) / 2;

          if (xLeft > chartWidth) break; // Stop if beyond chart
          if (xCenter < 0 || xCenter > chartWidth) continue;

          const isFuture = i >= chartData.length;

          // Calculate actual time for this column (use real-time reference for consistency)
          let timestamp: number;
          const intervalMs = intervalMinutes * 60 * 1000;

          if (isFuture) {
            // Future: use current real-time + offset
            const futureOffset = (i - chartData.length + 1) * intervalMs;
            timestamp = currentTime + futureOffset;
          } else {
            // Past/present: use current real-time - offset
            const pastOffset = (chartData.length - 1 - i) * intervalMs;
            timestamp = currentTime - pastOffset;
          }

          const date = new Date(timestamp);

          // Determine if we should draw label at this position based on grouping
          let shouldDrawLabel = false;
          if (labelGroupMinutes >= 60) {
            // Hourly labels - show on the hour
            shouldDrawLabel = date.getMinutes() === 0;
          } else if (labelGroupMinutes === 45) {
            // 45-minute labels - show at :00, :45
            shouldDrawLabel = date.getMinutes() === 0 || date.getMinutes() === 45;
          } else if (labelGroupMinutes === 30) {
            // 30-minute labels - show at :00, :30
            shouldDrawLabel = date.getMinutes() === 0 || date.getMinutes() === 30;
          } else if (labelGroupMinutes === 15) {
            // 15-minute labels - show at :00, :15, :30, :45
            shouldDrawLabel = date.getMinutes() % 15 === 0;
          } else if (labelGroupMinutes === 5) {
            // 5-minute labels - show at :00, :05, :10, etc.
            shouldDrawLabel = date.getMinutes() % 5 === 0;
          } else if (labelGroupMinutes === 1) {
            // 1-minute labels - show every minute
            shouldDrawLabel = true;
          } else {
            // Show every column based on columnsPerLabel
            shouldDrawLabel = i % columnsPerLabel === 0;
          }

          if (!shouldDrawLabel) continue;

          // Format label
          let timeLabel: string;
          if (minutesPerColumn >= 1440 || labelGroupMinutes >= 60) {
            // Show date and hour for daily or hourly grouping
            if (date.getHours() === 0 && date.getMinutes() === 0) {
              // Show date at midnight
              timeLabel = `${String(date.getDate()).padStart(2, '0')}/${String(
                date.getMonth() + 1,
              ).padStart(2, '0')}`;
            } else {
              // Show time
              timeLabel = `${String(date.getHours()).padStart(2, '0')}:${String(
                date.getMinutes(),
              ).padStart(2, '0')}`;
            }
          } else {
            // Show time HH:MM
            timeLabel = `${String(date.getHours()).padStart(2, '0')}:${String(
              date.getMinutes(),
            ).padStart(2, '0')}`;
          }

          // Different color for future labels
          ctx.fillStyle = isFuture ? '#6b7280' : '#94a3b8';

          // Draw label at bottom in the bottom margin
          const textWidth = ctx.measureText(timeLabel).width;
          ctx.fillText(timeLabel, xCenter - textWidth / 2, chartHeight + 15);
        }

        ctx.shadowBlur = 0;
      }

      // Draw chart based on type
      if (chartType === 'line') {
        // Draw line chart
        ctx.strokeStyle = '#3b82f6'; // Blue line
        ctx.lineWidth = 2;
        ctx.beginPath();

        let firstPoint = true;
        for (let i = 0; i < chartData.length; i++) {
          const x = timeToX(i);
          const y = priceToY(chartData[i].close);

          // Only draw points that are visible
          if (x >= -50 && x <= canvas.width + 50) {
            if (firstPoint) {
              ctx.moveTo(x, y);
              firstPoint = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      } else {
        // Draw candlestick chart
        for (let i = 0; i < chartData.length; i++) {
          const candle = chartData[i];
          const x = timeToX(i);

          // Skip if not visible
          if (x < -50 || x > canvas.width + 50) continue;

          const openY = priceToY(candle.open);
          const closeY = priceToY(candle.close);
          const highY = priceToY(candle.high);
          const lowY = priceToY(candle.low);

          const isBullish = candle.close >= candle.open;
          const color = isBullish ? '#10b981' : '#ef4444'; // Green for bullish, red for bearish

          // Calculate candle width (80% of available space)
          const candleWidth = Math.max(1, pixelsPerCandle * 0.8);

          // Draw wick (high-low line)
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, candleWidth * 0.1);
          ctx.beginPath();
          ctx.moveTo(x, highY);
          ctx.lineTo(x, lowY);
          ctx.stroke();

          // Draw body (open-close rectangle)
          const bodyHeight = Math.abs(closeY - openY);
          const bodyY = Math.min(openY, closeY);

          if (bodyHeight < 1) {
            // Doji candle (open == close) - draw horizontal line
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1, candleWidth * 0.15);
            ctx.beginPath();
            ctx.moveTo(x - candleWidth / 2, closeY);
            ctx.lineTo(x + candleWidth / 2, closeY);
            ctx.stroke();
          } else {
            // Normal candle
            ctx.fillStyle = color;
            ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);

            // Border for better visibility
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.strokeRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);
          }
        }
      }

      // Draw current price indicator
      // IMPORTANT: Use currentPrice prop for consistency across all components
      // This ensures the price shown matches TradingChart header and other displays
      if (currentPrice > 0 && chartData.length > 0) {
        const currentPriceY = priceToY(currentPrice);
        const latestDataX = timeToX(chartData.length - 1);

        // Current price line - horizontal line showing current price
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, currentPriceY);
        ctx.lineTo(chartWidth, currentPriceY); // Stop at chart boundary
        ctx.stroke();
        ctx.setLineDash([]);

        // Calculate countdown to next candle
        const getIntervalMs = (int: string): number => {
          if (int === 'D') return 86400000;
          const min = parseInt(int);
          return (isNaN(min) ? 60 : min) * 60 * 1000;
        };
        const intervalMs = getIntervalMs(interval);
        const currentWindow = Math.floor(currentTime / intervalMs) * intervalMs;
        const nextWindow = currentWindow + intervalMs;
        const timeUntilNext = nextWindow - currentTime;
        const secondsUntilNext = Math.floor(timeUntilNext / 1000);
        const minutesUntilNext = Math.floor(secondsUntilNext / 60);
        const secondsRemainder = secondsUntilNext % 60;

        // Current price label with countdown (in the right margin)
        const priceText = `$${currentPrice.toFixed(2)}`;
        const countdownText = `${String(minutesUntilNext).padStart(2, '0')}:${String(
          secondsRemainder,
        ).padStart(2, '0')}`;
        ctx.font = 'bold 11px monospace';
        const priceTextWidth = ctx.measureText(priceText).width;
        ctx.font = '9px monospace';
        const countdownWidth = ctx.measureText(countdownText).width;
        const totalWidth = Math.max(priceTextWidth, countdownWidth) + 8;

        // Draw in right margin (2 lines: price + countdown)
        ctx.fillStyle = '#10b981';
        ctx.fillRect(chartWidth + 5, currentPriceY - 16, totalWidth, 30);

        // Price text
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(priceText, chartWidth + 9, currentPriceY - 4);

        // Countdown text
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText(countdownText, chartWidth + 9, currentPriceY + 9);

        // Draw circular indicator at the end of line at current price level
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(latestDataX, currentPriceY, 5, 0, Math.PI * 2); // Circle with radius 5
        ctx.fill();

        // Draw white outline for better visibility
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(latestDataX, currentPriceY, 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw crosshair (follows mouse cursor) - only in chart area
      if (
        mousePosition &&
        tapToTradeEnabled &&
        mousePosition.x <= chartWidth &&
        mousePosition.y <= chartHeight
      ) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // White with transparency
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]); // Smaller dashes for crosshair

        // Vertical line - only in chart area
        ctx.beginPath();
        ctx.moveTo(mousePosition.x, 0);
        ctx.lineTo(mousePosition.x, chartHeight);
        ctx.stroke();

        // Horizontal line - only in chart area
        ctx.beginPath();
        ctx.moveTo(0, mousePosition.y);
        ctx.lineTo(chartWidth, mousePosition.y);
        ctx.stroke();

        ctx.setLineDash([]);

        // Calculate price at cursor position
        const cursorPrice = chartMaxPrice - (mousePosition.y / chartHeight) * chartPriceRange;

        // Calculate time at cursor position - snap to grid window start (no seconds)
        const cursorIndexFloat =
          (mousePosition.x - nowX) / pixelsPerCandle + latestDataIndex + panOffset;
        let cursorTime: number;

        const getIntervalMs = (int: string) => {
          if (int === 'D') return 86400000;
          const min = parseInt(int);
          return (isNaN(min) ? 60 : min) * 60 * 1000;
        };
        const intervalMs = getIntervalMs(interval);

        if (cursorIndexFloat >= chartData.length) {
          // Future time: use current real-time + offset
          const futureOffset = (cursorIndexFloat - chartData.length + 1) * intervalMs;
          cursorTime = currentTime + futureOffset;
        } else {
          // Past/present time: use current real-time - offset
          const pastOffset = (chartData.length - 1 - cursorIndexFloat) * intervalMs;
          cursorTime = currentTime - pastOffset;
        }

        // Snap to grid window start (round down to interval)
        cursorTime = Math.floor(cursorTime / intervalMs) * intervalMs;
        const cursorDate = new Date(cursorTime);

        // Draw price label in right margin (Y-axis)
        const priceText = `$${cursorPrice.toFixed(2)}`;
        ctx.font = '11px monospace';
        const priceTextWidth = ctx.measureText(priceText).width;

        // Price label background
        ctx.fillStyle = 'rgba(50, 50, 50, 0.9)';
        ctx.fillRect(chartWidth + 5, mousePosition.y - 10, priceTextWidth + 8, 18);

        // Price label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(priceText, chartWidth + 9, mousePosition.y + 3);

        // Draw time label in bottom margin (X-axis)
        const getIntervalMinutes = (intervalStr: string): number => {
          if (intervalStr === 'D') return 1440;
          const num = parseInt(intervalStr);
          return isNaN(num) ? 60 : num;
        };
        const intervalMinutes = getIntervalMinutes(interval);

        let timeText: string;
        if (intervalMinutes >= 1440) {
          // Show date for daily or longer
          timeText = `${String(cursorDate.getDate()).padStart(2, '0')}/${String(
            cursorDate.getMonth() + 1,
          ).padStart(2, '0')} ${String(cursorDate.getHours()).padStart(2, '0')}:${String(
            cursorDate.getMinutes(),
          ).padStart(2, '0')}`;
        } else {
          // Show time HH:MM (no seconds - this is window start time)
          timeText = `${String(cursorDate.getHours()).padStart(2, '0')}:${String(
            cursorDate.getMinutes(),
          ).padStart(2, '0')}`;
        }

        const timeTextWidth = ctx.measureText(timeText).width;

        // Time label background
        ctx.fillStyle = 'rgba(50, 50, 50, 0.9)';
        ctx.fillRect(
          mousePosition.x - timeTextWidth / 2 - 4,
          chartHeight + 2,
          timeTextWidth + 8,
          18,
        );

        // Time label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(timeText, mousePosition.x - timeTextWidth / 2, chartHeight + 15);
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    chartData,
    dimensions,
    currentPrice,
    tapToTradeEnabled,
    gridSize,
    hoveredCell,
    visibleCandles,
    tapToTrade.gridSizeX,
    tapToTrade.gridSession,
    tapToTrade.cellOrders,
    interval,
    panOffset,
    verticalPanOffset,
    mousePosition,
    basePrice,
    currentTime,
    chartType,
    isDragging,
    hasMoved,
  ]);

  // Mouse drag handlers (like PerSecondChart)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault(); // Prevent text selection
      setIsDragging(true);
      setHasMoved(false); // Reset movement flag
      setDragStartX(e.clientX);
      setDragStartY(e.clientY);
      setDragStartPanOffset(panOffset);
      setDragStartVerticalOffset(verticalPanOffset);
    },
    [panOffset, verticalPanOffset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      setMousePosition({ x: mouseX, y: mouseY });

      if (isDragging) {
        e.preventDefault();

        // Both horizontal and vertical movement
        const deltaX = dragStartX - e.clientX;
        const deltaY = dragStartY - e.clientY;

        // Check if moved significantly (more than 5 pixels)
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
          setHasMoved(true);
          setPanOffset(dragStartPanOffset + deltaX);
          // Invert vertical: drag up = chart goes down (see lower prices)
          setVerticalPanOffset(dragStartVerticalOffset - deltaY);
        }
      }
    },
    [isDragging, dragStartX, dragStartY, dragStartPanOffset, dragStartVerticalOffset],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // If didn't move, treat as tap/click
      if (isDragging && !hasMoved && tapToTradeEnabled) {
        // This is a tap, handle order placement
        // We need to calculate the cell here instead of relying on hoveredCell
        if (!canvasRef.current || chartData.length === 0) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;

        // Define margins (same as in draw function)
        const rightMargin = isMobile ? 80 : 120;
        const bottomMargin = 25;
        const chartWidth = canvas.width - rightMargin;
        const chartHeight = canvas.height - bottomMargin;

        // Ignore clicks in margin areas
        if (clickX <= chartWidth && clickY <= chartHeight) {
          // Call the actual cell tap handler
          handleCellTapLogic(clickX, clickY, chartWidth, chartHeight);
        }
      }

      setIsDragging(false);
      setHasMoved(false);
    },
    [isDragging, hasMoved, tapToTradeEnabled, chartData.length],
  );

  // Handle cell tap logic (extracted from original handleCanvasClick)
  const handleCellTapLogic = useCallback(
    (clickX: number, clickY: number, chartWidth: number, chartHeight: number) => {
      if (!tapToTradeEnabled || !canvasRef.current || chartData.length === 0) {
        return;
      }

      // Calculate what was clicked (same as drawing logic)
      const prices =
        chartType === 'candle'
          ? chartData.flatMap((d) => [d.high, d.low])
          : chartData.map((d) => d.close);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice;
      const padding = priceRange * 0.1;

      const gridSizeX = tapToTrade.gridSizeX || 1;
      const pixelsPerCandle = (chartWidth * 0.5) / visibleCandles;

      // User input grid step in dollars (Y axis)
      const gridStepDollar = (gridSize / 100) * basePrice;

      // Calculate price range based on grid settings to make square cells (same as drawing logic)
      // Each cell is ALWAYS 1 candle wide for perfect square
      // gridYHeightPixels = (gridStepDollar / chartPriceRange) * chartHeight
      // We want: gridYHeightPixels = pixelsPerCandle (1 candle width)
      const gridXWidthPixels = pixelsPerCandle; // 1 candle = 1 cell
      const chartPriceRange = (gridStepDollar * chartHeight) / gridXWidthPixels;

      // Center the price range around data (same as drawing logic)
      const priceCenter = (minPrice + maxPrice) / 2;
      const pixelsPerPrice = chartHeight / chartPriceRange;
      const verticalShift = verticalPanOffset / pixelsPerPrice;

      const chartMinPrice = priceCenter - chartPriceRange / 2 + verticalShift;
      const chartMaxPrice = priceCenter + chartPriceRange / 2 + verticalShift;

      // Convert click position to price and snap to grid
      const clickedPrice = chartMaxPrice - (clickY / chartHeight) * chartPriceRange;

      // Calculate price level INDEX (stable integer, not absolute price)
      const priceLevelIndex = Math.floor(clickedPrice / gridStepDollar);
      const actualPrice = priceLevelIndex * gridStepDollar;

      // Convert click position to time index with better precision
      const nowX = chartWidth * 0.5; // Center position
      const latestDataIndex = chartData.length - 1;

      // Reverse engineer which index the click corresponds to
      // timeToX formula: x = nowX + (index - latestDataIndex) * pixelsPerCandle - panOffset
      // Solving for index: index = (x - nowX + panOffset) / pixelsPerCandle + latestDataIndex
      const clickIndexFloat = (clickX - nowX + panOffset) / pixelsPerCandle + latestDataIndex;

      // Snap to grid boundaries
      // Grid cells are drawn starting at i=0, then i=gridSizeX, i=2*gridSizeX, etc.
      // We want to find which grid cell [i, i+gridSizeX) contains clickIndexFloat
      const snappedCandleIndex = Math.floor(clickIndexFloat / gridSizeX) * gridSizeX;

      // Calculate actual timestamp for clicked cell using SNAPPED index (real-time reference)
      let clickedTime: number;
      const isFutureClick = snappedCandleIndex >= chartData.length;

      const getIntervalMs = (int: string) => {
        if (int === 'D') return 86400000;
        const min = parseInt(int);
        return (isNaN(min) ? 60 : min) * 60 * 1000;
      };
      const intervalMs = getIntervalMs(interval);

      if (isFutureClick) {
        // Future click: use current real-time + offset
        const futureOffset = (snappedCandleIndex - chartData.length + 1) * intervalMs;
        clickedTime = currentTime + futureOffset;
      } else {
        // Past/present click: use current real-time - offset
        const pastOffset = (chartData.length - 1 - snappedCandleIndex) * intervalMs;
        clickedTime = currentTime - pastOffset;
      }

      // Round time to base interval (NOT gridSizeX interval)
      // Each candle should remain its base timeframe (1m stays 1m, not 3m when gridSizeX=3)
      const gridTimeRounded = Math.floor(clickedTime / intervalMs) * intervalMs;

      // Calculate cellX (time column index) - same logic as drawing
      const gridSession = tapToTrade.gridSession;
      let cellX = 0;
      let cellY = 0;

      if (gridSession) {
        const timeSeconds = Math.floor(gridTimeRounded / 1000);
        const referenceTime = gridSession.referenceTime;
        const columnDurationSeconds = Math.max(
          1,
          gridSession.gridSizeX * gridSession.timeframeSeconds,
        );
        cellX = Math.floor((timeSeconds - referenceTime) / columnDurationSeconds);

        // Calculate cellY as RELATIVE offset from reference price
        const referencePrice = parseFloat(gridSession.referencePrice) / 100000000;
        const referencePriceLevel = Math.floor(referencePrice / gridStepDollar);
        cellY = priceLevelIndex - referencePriceLevel; // Relative offset
      } else {
        // Fallback if no grid session
        cellY = priceLevelIndex;
      }

      // Use same format as TapToTradeContext
      const cellId = `${cellX},${cellY}`;

      // Calculate the actual timestamp that backend expects (aligned with gridSession)
      let backendTimestamp = clickedTime; // fallback
      if (gridSession) {
        // Backend expects: referenceTime + (cellX * columnDuration)
        const columnDurationSeconds = gridSession.gridSizeX * gridSession.timeframeSeconds;
        backendTimestamp = (gridSession.referenceTime + cellX * columnDurationSeconds) * 1000; // Convert to ms
      }

      // Check if click is reasonable (within some bounds)
      if (snappedCandleIndex > -100) {
        // Allow some past clicks
        // Determine LONG/SHORT based on cellY relative to reference
        // cellY < 0 (below reference) = LONG (buy low)
        // cellY > 0 (above reference) = SHORT (sell high)
        const isLong = cellY < 0;

        onCellTap(cellId, actualPrice, backendTimestamp, isLong);
      }
    },
    [
      tapToTradeEnabled,
      chartData,
      currentPrice,
      gridSize,
      onCellTap,
      tapToTrade.gridSizeX,
      tapToTrade.gridSession,
      visibleCandles,
      interval,
      panOffset,
      verticalPanOffset,
      basePrice,
      currentTime,
      chartType,
    ],
  );

  // Handle canvas hover
  const handleCanvasMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || chartData.length === 0) {
        setHoveredCell(null);
        setMousePosition(null);
        return;
      }

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      // Account for canvas scaling
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      // Update mouse position for crosshair
      setMousePosition({ x: mouseX, y: mouseY });

      // Define margins (same as in draw function)
      const rightMargin = isMobile ? 80 : 120;
      const bottomMargin = 25;
      const chartWidth = canvas.width - rightMargin;
      const chartHeight = canvas.height - bottomMargin;

      // Don't show hover in margin areas
      if (mouseX > chartWidth || mouseY > chartHeight) {
        setHoveredCell(null);
        return;
      }

      if (!tapToTradeEnabled) {
        return;
      }

      // Calculate hovered cell (same as drawing logic)
      const prices =
        chartType === 'candle'
          ? chartData.flatMap((d) => [d.high, d.low])
          : chartData.map((d) => d.close);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice;
      const padding = priceRange * 0.1;

      const nowX = chartWidth * 0.5; // Center position
      const latestDataIndex = chartData.length - 1;
      const pixelsPerCandle = (chartWidth * 0.5) / visibleCandles;
      const gridSizeX = tapToTrade.gridSizeX || 1;

      // User input grid step in dollars (Y axis)
      const gridStepDollar = (gridSize / 100) * basePrice;

      // Calculate price range based on grid settings to make square cells (same as drawing logic)
      // Each cell is ALWAYS 1 candle wide for perfect square
      const gridXWidthPixels = pixelsPerCandle; // 1 candle = 1 cell
      const chartPriceRange = (gridStepDollar * chartHeight) / gridXWidthPixels;

      // Center the price range around data
      const priceCenter = (minPrice + maxPrice) / 2;
      const pixelsPerPrice = chartHeight / chartPriceRange;
      const verticalShift = verticalPanOffset / pixelsPerPrice;

      const chartMinPrice = priceCenter - chartPriceRange / 2 + verticalShift;
      const chartMaxPrice = priceCenter + chartPriceRange / 2 + verticalShift;

      const hoveredPrice = chartMaxPrice - (mouseY / chartHeight) * chartPriceRange;

      // Calculate price level INDEX (stable integer, not absolute price)
      const priceLevelIndex = Math.floor(hoveredPrice / gridStepDollar);

      // Reverse engineer which index the mouse corresponds to
      // timeToX formula: x = nowX + (index - latestDataIndex) * pixelsPerCandle - panOffset
      // Solving for index: index = (x - nowX + panOffset) / pixelsPerCandle + latestDataIndex
      const mouseIndexFloat = (mouseX - nowX + panOffset) / pixelsPerCandle + latestDataIndex;

      // Snap to grid boundaries
      // Grid cells are drawn starting at i=0, then i=gridSizeX, i=2*gridSizeX, etc.
      // We want to find which grid cell [i, i+gridSizeX) contains mouseIndexFloat
      const snappedCandleIndex = Math.floor(mouseIndexFloat / gridSizeX) * gridSizeX;

      // Calculate actual timestamp for hovered cell using SNAPPED index (real-time reference)
      let hoveredTime: number;
      const isFutureHover = snappedCandleIndex >= chartData.length;

      const getIntervalMs = (int: string) => {
        if (int === 'D') return 86400000;
        const min = parseInt(int);
        return (isNaN(min) ? 60 : min) * 60 * 1000;
      };
      const intervalMs = getIntervalMs(interval);

      if (isFutureHover) {
        // Future hover: use current real-time + offset
        const futureOffset = (snappedCandleIndex - chartData.length + 1) * intervalMs;
        hoveredTime = currentTime + futureOffset;
      } else {
        // Past/present hover: use current real-time - offset
        const pastOffset = (chartData.length - 1 - snappedCandleIndex) * intervalMs;
        hoveredTime = currentTime - pastOffset;
      }

      // Round time to base interval (NOT gridSizeX interval)
      // Each candle should remain its base timeframe (1m stays 1m, not 3m when gridSizeX=3)
      const gridTimeRounded = Math.floor(hoveredTime / intervalMs) * intervalMs;

      // Calculate cellX (time column index) - same logic as drawing
      const gridSession = tapToTrade.gridSession;
      let cellX = 0;
      let cellY = 0;

      if (gridSession) {
        const timeSeconds = Math.floor(gridTimeRounded / 1000);
        const referenceTime = gridSession.referenceTime;
        const columnDurationSeconds = Math.max(
          1,
          gridSession.gridSizeX * gridSession.timeframeSeconds,
        );
        cellX = Math.floor((timeSeconds - referenceTime) / columnDurationSeconds);

        // Calculate cellY as RELATIVE offset from reference price
        const referencePrice = parseFloat(gridSession.referencePrice) / 100000000;
        const referencePriceLevel = Math.floor(referencePrice / gridStepDollar);
        cellY = priceLevelIndex - referencePriceLevel; // Relative offset
      } else {
        // Fallback if no grid session
        cellY = priceLevelIndex;
      }

      // Use same format as TapToTradeContext
      const cellId = `${cellX},${cellY}`;

      // Check if hover is reasonable
      if (snappedCandleIndex > -100) {
        setHoveredCell(cellId);
      } else {
        setHoveredCell(null);
      }
    },
    [
      tapToTradeEnabled,
      chartData,
      gridSize,
      tapToTrade.gridSizeX,
      tapToTrade.gridSession,
      visibleCandles,
      currentPrice,
      interval,
      panOffset,
      verticalPanOffset,
      basePrice,
      currentTime,
      chartType,
    ],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
    setMousePosition(null); // Hide crosshair when mouse leaves
    setIsDragging(false); // Stop dragging if mouse leaves
    setHasMoved(false);
  }, []);

  // Quick Trade handlers
  const handleQuickTrade = (isLong: boolean) => {
    const collateral = parseFloat(quickTradeCollateral);
    const leverage = parseFloat(quickTradeLeverage);

    if (isNaN(collateral) || collateral <= 0) {
      toast.error('Invalid collateral amount', { duration: 1500 });
      return;
    }

    if (isNaN(leverage) || leverage <= 0) {
      toast.error('Invalid leverage', { duration: 1500 });
      return;
    }

    const action = isLong ? 'LONG' : 'SHORT';
    const price = currentPrice.toFixed(2);

    toast.success(`${action} $${collateral} @ $${price} (${leverage}x)`, {
      duration: 1500,
      style: {
        background: isLong ? '#10b981' : '#ef4444',
        color: '#fff',
      },
    });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Hide number input spinners */}
      <style>{`
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
      {/* Quick Trade Panel - top right */}
      {tapToTradeEnabled && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '135px', // Move away from price scale
            zIndex: 10,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            borderRadius: '3px',
            padding: '6px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            width: '100px', // Fixed compact width
            boxSizing: 'border-box',
            backdropFilter: 'blur(4px)',
          }}
        >
          {/* Title */}
          <div
            style={{
              fontSize: '8px',
              fontWeight: '600',
              color: '#94a3b8',
              marginBottom: '4px',
              fontFamily: 'monospace',
              textAlign: 'center',
              letterSpacing: '0.3px',
            }}
          >
            QUICK TRADE
          </div>

          {/* Inputs - horizontal layout */}
          <div
            style={{
              display: 'flex',
              gap: '3px',
              marginBottom: '4px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {/* Collateral Input */}
            <input
              type="number"
              value={quickTradeCollateral}
              onChange={(e) => setQuickTradeCollateral(e.target.value)}
              placeholder="$"
              title="Collateral"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '3px 2px',
                fontSize: '9px',
                fontFamily: 'monospace',
                backgroundColor: 'rgba(30, 30, 40, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '2px',
                color: '#ffffff',
                outline: 'none',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              }}
            />

            {/* Leverage Input */}
            <input
              type="number"
              value={quickTradeLeverage}
              onChange={(e) => setQuickTradeLeverage(e.target.value)}
              placeholder="x"
              title="Leverage"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '3px 2px',
                fontSize: '9px',
                fontFamily: 'monospace',
                backgroundColor: 'rgba(30, 30, 40, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '2px',
                color: '#ffffff',
                outline: 'none',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              }}
            />
          </div>

          {/* Buy/Sell Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '3px',
            }}
          >
            {/* BUY Button */}
            <button
              onClick={() => handleQuickTrade(true)}
              style={{
                flex: 1,
                padding: '5px 0',
                fontSize: '9px',
                fontWeight: '700',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '2px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                transition: 'all 0.15s',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#059669';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#10b981';
              }}
            >
              BUY
            </button>

            {/* SELL Button */}
            <button
              onClick={() => handleQuickTrade(false)}
              style={{
                flex: 1,
                padding: '5px 0',
                fontSize: '9px',
                fontWeight: '700',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '2px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                transition: 'all 0.15s',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#dc2626';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ef4444';
              }}
            >
              SELL
            </button>
          </div>
        </div>
      )}

      {/* Chart type toggle button - top left */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 10,
          display: 'flex',
          gap: '0px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          borderRadius: '6px',
          padding: '2px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <button
          onClick={() => setChartType('line')}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: '500',
            backgroundColor: chartType === 'line' ? 'rgba(59, 130, 246, 0.8)' : 'transparent',
            color: chartType === 'line' ? '#ffffff' : '#94a3b8',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'monospace',
          }}
          onMouseEnter={(e) => {
            if (chartType !== 'line') {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }
          }}
          onMouseLeave={(e) => {
            if (chartType !== 'line') {
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        >
          Line
        </button>
        <button
          onClick={() => setChartType('candle')}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: '500',
            backgroundColor: chartType === 'candle' ? 'rgba(59, 130, 246, 0.8)' : 'transparent',
            color: chartType === 'candle' ? '#ffffff' : '#94a3b8',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'monospace',
          }}
          onMouseEnter={(e) => {
            if (chartType !== 'candle') {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }
          }}
          onMouseLeave={(e) => {
            if (chartType !== 'candle') {
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        >
          Candle
        </button>
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            setIsDragging(true);
            setHasMoved(false);
            setDragStartX(touch.clientX);
            setDragStartY(touch.clientY);
            setDragStartPanOffset(panOffset);
            setDragStartVerticalOffset(verticalPanOffset);
          }
        }}
        onTouchMove={(e) => {
          if (isDragging && e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const deltaX = dragStartX - touch.clientX;
            const deltaY = touch.clientY - dragStartY; // Inverted for natural touch scrolling

            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
              setHasMoved(true);
            }

            setPanOffset(dragStartPanOffset + deltaX);
            setVerticalPanOffset(dragStartVerticalOffset + deltaY);
          }
        }}
        onTouchEnd={() => {
          setIsDragging(false);
        }}
        style={{
          width: '100%',
          height: '100%',
          cursor:
            isDragging && hasMoved
              ? 'grabbing'
              : hoveredCell && tapToTradeEnabled && !isDragging
              ? 'pointer'
              : 'grab',
          touchAction: 'none', // Allow both horizontal and vertical panning
          userSelect: 'none', // Prevent text selection during drag
        }}
      />
    </div>
  );
};

export default SimpleLineChart;
