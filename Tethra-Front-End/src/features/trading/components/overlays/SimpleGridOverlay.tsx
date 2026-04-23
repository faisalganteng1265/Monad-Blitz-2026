'use client';

import React, { useEffect, useState, useRef } from 'react';
import { GridConfig } from '@/types/gridTrading';

interface SimpleGridOverlayProps {
  gridConfig: GridConfig;
  selectedCells: Set<string>;
  currentPrice: number;
  onCellClick: (cellId: string, price: number, isAbovePrice: boolean) => void;
}

const SimpleGridOverlay: React.FC<SimpleGridOverlayProps> = ({
  gridConfig,
  selectedCells,
  currentPrice,
  onCellClick,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (overlayRef.current) {
        const parent = overlayRef.current.parentElement;
        if (parent) {
          setDimensions({
            width: parent.clientWidth,
            height: parent.clientHeight,
          });
        }
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    const interval = setInterval(updateDimensions, 500);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearInterval(interval);
    };
  }, []);

  if (!gridConfig.enabled || dimensions.width === 0 || dimensions.height === 0) {
    return null;
  }

  // Calculate grid cells
  const numHorizontalCells = 10; // Number of time cells
  const numVerticalCells = 20; // Number of price cells

  const cellWidth = dimensions.width / numHorizontalCells;
  const cellHeight = dimensions.height / numVerticalCells;

  // Calculate price levels
  const priceStep = gridConfig.priceGridType === 'percentage'
    ? currentPrice * (gridConfig.priceGridSize / 100)
    : gridConfig.priceGridSize;

  const midPoint = Math.floor(numVerticalCells / 2);

  const cells: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    price: number;
    isAbovePrice: boolean;
  }> = [];

  // Generate grid cells
  for (let row = 0; row < numVerticalCells; row++) {
    for (let col = 0; col < numHorizontalCells; col++) {
      // Calculate price for this row (top to bottom = high to low price)
      const priceOffset = (midPoint - row) * priceStep;
      const cellPrice = currentPrice + priceOffset;
      const isAbovePrice = cellPrice > currentPrice;
      
      const cellId = `cell-${row}-${col}`;
      
      cells.push({
        id: cellId,
        x: col * cellWidth,
        y: row * cellHeight,
        width: cellWidth,
        height: cellHeight,
        price: cellPrice,
        isAbovePrice,
      });
    }
  }

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
        zIndex: 10,
      }}
    >
      {/* Grid Lines */}
      <svg
        width={dimensions.width}
        height={dimensions.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
        }}
      >
        {/* Horizontal lines */}
        {Array.from({ length: numVerticalCells + 1 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={i * cellHeight}
            x2={dimensions.width}
            y2={i * cellHeight}
            stroke="#334155"
            strokeWidth={1}
            strokeOpacity={0.3}
            strokeDasharray="4 4"
          />
        ))}
        
        {/* Vertical lines */}
        {Array.from({ length: numHorizontalCells + 1 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={i * cellWidth}
            y1={0}
            x2={i * cellWidth}
            y2={dimensions.height}
            stroke="#334155"
            strokeWidth={1}
            strokeOpacity={0.3}
            strokeDasharray="4 4"
          />
        ))}

        {/* Current price line */}
        <line
          x1={0}
          y1={dimensions.height / 2}
          x2={dimensions.width}
          y2={dimensions.height / 2}
          stroke="#3b82f6"
          strokeWidth={2}
          strokeOpacity={0.8}
        />
        
        {/* Price labels */}
        {gridConfig.showLabels && Array.from({ length: numVerticalCells + 1 }).map((_, i) => {
          const priceOffset = (midPoint - i) * priceStep;
          const labelPrice = currentPrice + priceOffset;
          
          return (
            <text
              key={`label-${i}`}
              x={dimensions.width - 60}
              y={i * cellHeight + 12}
              fontSize="10"
              fill="#94a3b8"
              style={{ pointerEvents: 'none' }}
            >
              ${labelPrice.toFixed(2)}
            </text>
          );
        })}
      </svg>

      {/* Interactive Grid Cells */}
      {cells.map((cell) => {
        const isSelected = selectedCells.has(cell.id);
        const color = cell.isAbovePrice ? '#ef4444' : '#10b981';

        return (
          <div
            key={cell.id}
            onClick={() => onCellClick(cell.id, cell.price, cell.isAbovePrice)}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = `${color}20`;
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = isSelected ? `${color}40` : 'transparent';
              }
            }}
            style={{
              position: 'absolute',
              left: `${cell.x}px`,
              top: `${cell.y}px`,
              width: `${cell.width}px`,
              height: `${cell.height}px`,
              backgroundColor: isSelected ? `${color}40` : 'transparent',
              border: isSelected ? `2px solid ${color}` : 'none',
              cursor: 'pointer',
              pointerEvents: 'auto',
              transition: 'all 0.2s ease',
            }}
            title={`${cell.isAbovePrice ? 'Sell' : 'Buy'} @ $${cell.price.toFixed(2)}`}
          />
        );
      })}
    </div>
  );
};

export default SimpleGridOverlay;
