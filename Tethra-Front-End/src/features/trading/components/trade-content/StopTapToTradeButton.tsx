import { Button } from '@/components/ui/button';
import React from 'react';

interface StopTapToTradeButtonProps {
  onStop: () => void;
}

export default function StopTapToTradeButton({ onStop }: StopTapToTradeButtonProps) {
  return (
    <div className="w-full bg-trading-dark border-t border-border-default">
      <Button
        onClick={onStop}
        variant="destructive"
        className="w-full h-14 text-lg font-bold gap-2 uppercase tracking-wide"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M18 6L6 18" />
          <path d="M6 6L18 18" />
        </svg>
        Stop Trading
      </Button>
    </div>
  );
}
