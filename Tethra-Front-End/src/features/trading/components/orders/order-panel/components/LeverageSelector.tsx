import React, { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { generateLeverageValues, getCurrentSliderIndex } from '../utils/leverageUtils';

interface LeverageSelectorProps {
  leverage: number;
  onLeverageChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  markers?: number[];
}

export const LeverageSelector: React.FC<LeverageSelectorProps> = ({
  leverage,
  onLeverageChange,
  disabled = false,
  markers = [1, 2, 5, 10, 25, 50, 100],
}) => {
  const formatLeverageValue = (value: number) =>
    Number.isInteger(value) ? value.toString() : value.toFixed(1);
  const [leverageInput, setLeverageInput] = useState<string>(formatLeverageValue(leverage));

  // Memoize leverage values to avoid recalculation
  const normalizedMarkers = React.useMemo(
    () => Array.from(new Set(markers)).sort((a, b) => a - b),
    [markers],
  );
  const leverageValues = React.useMemo(
    () => generateLeverageValues(normalizedMarkers),
    [normalizedMarkers],
  );
  const maxSliderValue = leverageValues.length - 1;
  const currentIndex = getCurrentSliderIndex(leverage, leverageValues);
  const maxAllowed = normalizedMarkers[normalizedMarkers.length - 1] ?? 100;

  useEffect(() => {
    if (!document.activeElement?.classList.contains('leverage-input')) {
      setLeverageInput(formatLeverageValue(leverage));
    }
  }, [leverage]);

  const handleSliderChange = (value: number[]) => {
    const index = value[0];
    const newValue = leverageValues[index];
    onLeverageChange(newValue);
    setLeverageInput(formatLeverageValue(newValue));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d{0,1}$/.test(value)) {
      setLeverageInput(value);
      if (value !== '' && value !== '.') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0.1 && numValue <= maxAllowed) {
          onLeverageChange(numValue);
        }
      }
    }
  };

  const handleInputBlur = () => {
    if (leverageInput === '' || leverageInput === '.') {
      setLeverageInput(formatLeverageValue(1));
      onLeverageChange(1);
    } else {
      setLeverageInput(formatLeverageValue(leverage));
    }
  };

  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <label className="text-xs text-text-secondary mb-2 block">Leverage</label>
      <div className="flex items-center gap-6">
        <div className="flex-1 relative pt-2 pb-6">
          <Slider
            defaultValue={[currentIndex]}
            value={[currentIndex]}
            max={maxSliderValue}
            step={1}
            onValueChange={handleSliderChange}
            disabled={disabled}
            className="z-10 relative"
          />
          {/* Markers - Custom styling needed to match absolute position logic */}
          <div className="absolute top-full -mt-4 left-0 right-0 h-4">
            {markers.map((marker, index) => {
              const markerIndex = leverageValues.findIndex((v) => Math.abs(v - marker) < 0.01);
              if (markerIndex < 0) return null;
              const position = (markerIndex / maxSliderValue) * 100;
              return (
                <span
                  key={index}
                  className="absolute text-[10px] text-text-muted font-medium transform -translate-x-1/2"
                  style={{
                    left: `${position}%`,
                  }}
                >
                  {marker < 1 ? marker.toFixed(1) : marker}x
                </span>
              );
            })}
          </div>
        </div>

        {/* Input Box */}
        <div className="bg-trading-elevated rounded-lg py-1 min-w-[65px] flex items-center justify-center gap-1 border border-border-default">
          <Input
            type="text"
            value={leverageInput}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            disabled={disabled}
            className="leverage-input h-7 bg-transparent text-sm font-semibold text-text-primary border-none p-0 w-[6ch] text-right focus-visible:ring-0"
          />
          <span className="text-sm font-semibold text-text-primary">x</span>
        </div>
      </div>
    </div>
  );
};
