import { ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BottomPanelToggleProps {
  isOpen: boolean;
  onToggle: () => void;
  isMobile?: boolean;
}

export default function BottomPanelToggle({
  isOpen,
  onToggle,
  isMobile = false,
}: BottomPanelToggleProps) {
  if (isOpen) {
    return (
      <div className="flex justify-center">
        <button
          onClick={onToggle}
          className="bg-trading-bg border border-border-default rounded-t-lg px-4 py-2 flex items-center gap-2 hover:bg-button-hover transition-colors"
        >
          <ChevronDown size={16} className="text-text-secondary" />
          <span className="text-xs text-text-secondary font-medium cursor-pointer">
            Close Positions
          </span>
          <ChevronDown size={16} className="text-text-secondary" />
        </button>
      </div>
    );
  }

  const buttonClasses = isMobile
    ? 'lg:hidden fixed bottom-16 left-1/2 -translate-x-1/2 z-50'
    : 'hidden lg:flex absolute bottom-2 left-1/2 -translate-x-1/2 z-50';

  return (
    <Button
      onClick={onToggle}
      className={`${buttonClasses} bg-trading-bg border border-border-default rounded-t-lg px-4 py-2 items-center gap-2 hover:bg-button-hover transition-colors cursor-pointer`}
    >
      <ChevronUp size={16} className="text-text-secondary" />
      <span className="text-xs text-text-secondary font-medium">Open Positions</span>
      <ChevronUp size={16} className="text-text-secondary" />
    </Button>
  );
}
