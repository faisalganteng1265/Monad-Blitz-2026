'use client';

import React, { useEffect, useRef, useState } from 'react';

interface Rectangle {
  id: string;
  x: number; // Canvas X position
  y: number; // Canvas Y position
  width: number; // Width in pixels (representing X grid units)
  height: number; // Height in pixels (representing Y price units)
  timestamp: number;
}

interface ChartOverlayProps {
  isActive: boolean;
  xGridSize: number; // Number of candles per grid
  yGridSize: number; // Price range per grid
  onRectangleAdded?: (rect: Rectangle) => void;
}

const ChartOverlay: React.FC<ChartOverlayProps> = ({
  isActive,
  xGridSize,
  yGridSize,
  onRectangleAdded
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rectangles, setRectangles] = useState<Rectangle[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Setup canvas size
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width, height });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Draw rectangles on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all rectangles
    rectangles.forEach(rect => {
      // Draw filled rectangle
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'; // Blue transparent
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

      // Draw border
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'; // Blue border
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

      // Draw grid lines inside rectangle
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
      ctx.lineWidth = 1;

      // Vertical grid lines (based on xGridSize)
      const gridWidth = rect.width; // Since we want 1 grid = xGridSize candles
      for (let i = 1; i < xGridSize; i++) {
        const x = rect.x + (gridWidth / xGridSize) * i;
        ctx.beginPath();
        ctx.moveTo(x, rect.y);
        ctx.lineTo(x, rect.y + rect.height);
        ctx.stroke();
      }

      // Horizontal grid lines (based on yGridSize)
      const gridHeight = rect.height;
      const yGridCount = Math.ceil(yGridSize / 10); // Divide price range into segments
      for (let i = 1; i < yGridCount; i++) {
        const y = rect.y + (gridHeight / yGridCount) * i;
        ctx.beginPath();
        ctx.moveTo(rect.x, y);
        ctx.lineTo(rect.x + rect.width, y);
        ctx.stroke();
      }

      // Draw label
      ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
      ctx.font = 'bold 11px monospace';
      const label = `${xGridSize}x${yGridSize}`;
      const metrics = ctx.measureText(label);
      const padding = 4;

      // Background for label
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(
        rect.x + 4,
        rect.y + 4,
        metrics.width + padding * 2,
        16
      );

      // Label text
      ctx.fillStyle = 'rgba(59, 130, 246, 1)';
      ctx.fillText(label, rect.x + 4 + padding, rect.y + 4 + 12);
    });
  }, [rectangles, xGridSize, yGridSize]);

  // Handle canvas click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActive || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Calculate grid size in pixels
    // For demo purposes, we'll use approximate pixel sizes
    // In production, you'd calculate this based on chart timeframe and price scale
    const estimatedCandleWidth = 10; // pixels per candle (approximate)
    const estimatedPricePixelsPerDollar = 2; // pixels per dollar (approximate)

    const gridPixelWidth = xGridSize * estimatedCandleWidth;
    const gridPixelHeight = yGridSize * estimatedPricePixelsPerDollar;

    // Snap to grid (optional - for cleaner placement)
    const snappedX = Math.floor(clickX / gridPixelWidth) * gridPixelWidth;
    const snappedY = Math.floor(clickY / gridPixelHeight) * gridPixelHeight;

    const newRect: Rectangle = {
      id: `rect-${Date.now()}`,
      x: snappedX,
      y: snappedY,
      width: gridPixelWidth,
      height: gridPixelHeight,
      timestamp: Date.now()
    };

    setRectangles(prev => [...prev, newRect]);
    onRectangleAdded?.(newRect);
  };

  // Clear rectangles when mode is deactivated
  useEffect(() => {
    if (!isActive) {
      setRectangles([]);
    }
  }, [isActive]);

  if (!isActive && rectangles.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onClick={handleCanvasClick}
        className={`absolute inset-0 ${isActive ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
        style={{
          width: '100%',
          height: '100%',
        }}
      />

      {/* Active mode visual indicator */}
      {isActive && (
        <div className="absolute top-4 left-4 bg-blue-500/90 text-white px-3 py-2 rounded-lg shadow-lg pointer-events-none flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          <span className="text-xs font-bold">
            Tap to Trade Active ({xGridSize} candles × ${yGridSize})
          </span>
        </div>
      )}
    </div>
  );
};

export default ChartOverlay;
