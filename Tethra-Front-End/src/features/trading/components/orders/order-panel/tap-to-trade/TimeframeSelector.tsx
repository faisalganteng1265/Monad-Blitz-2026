import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TimeframeOption {
  label: string;
  value: string;
}

const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '30m', value: '30' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: '1D', value: 'D' },
];

interface TimeframeSelectorProps {
  timeframe: string;
  setTimeframe: (value: string) => void;
  disabled?: boolean;
}

export const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({
  timeframe,
  setTimeframe,
  disabled = false,
}) => {
  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <label className="text-xs text-text-secondary mb-2 block">Timeframe</label>
      <Select value={timeframe} onValueChange={setTimeframe} disabled={disabled}>
        <SelectTrigger className="w-full bg-trading-surface border-border-default h-11">
          <SelectValue placeholder="Select timeframe" />
        </SelectTrigger>
        <SelectContent className="bg-trading-surface border-border-default">
          {TIMEFRAME_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-text-primary focus:bg-trading-elevated focus:text-text-primary"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
