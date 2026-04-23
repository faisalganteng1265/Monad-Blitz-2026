import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface MarketActionButtonsProps {
  isUSDCApprovalPending?: boolean;
  activeTab: 'long' | 'short' | 'swap';
  authenticated: boolean;
  isApproving: boolean;
  isDepositing: boolean;
  isRelayPending: boolean;
  payAmount: string;
  hasLargeAllowance: boolean;
  hasInsufficientBalance?: boolean;
  onAction: () => void;
}

export const MarketActionButtons: React.FC<MarketActionButtonsProps> = ({
  activeTab,
  authenticated,
  isApproving,
  isDepositing,
  isRelayPending,
  isUSDCApprovalPending,
  payAmount,
  hasLargeAllowance,
  hasInsufficientBalance,
  onAction,
}) => {
  const needsActivation = !hasLargeAllowance;
  const isInsufficient = Boolean(hasInsufficientBalance);

  const getButtonText = () => {
    if (!authenticated) return 'Connect Wallet';
    if (isInsufficient) return 'Insufficient Balance';
    if (needsActivation) return isUSDCApprovalPending ? 'Activating Trading...' : 'Activate Trading';
    if (isUSDCApprovalPending) return 'Approving USDC...';
    if (isApproving) return 'Approving for Paymaster...';
    if (isDepositing) return 'Depositing to Paymaster...';
    if (isRelayPending) return 'Opening Position...';
    if (!payAmount || parseFloat(payAmount) <= 0) return 'Enter Amount';

    if ((activeTab === 'long' || activeTab === 'short') && !hasLargeAllowance) {
      return `Approve & ${activeTab === 'long' ? 'Long' : 'Short'}`;
    }

    if (activeTab === 'long') return 'Buy / Long';
    if (activeTab === 'short') return 'Sell / Short';
    return 'Swap';
  };

  const isButtonDisabled =
    !authenticated ||
    isInsufficient ||
    isRelayPending ||
    isApproving ||
    isDepositing ||
    isUSDCApprovalPending ||
    (!needsActivation && (!payAmount || parseFloat(payAmount) <= 0));

  // Variant mapping to shadcn button variants or custom classes
  // Assuming shadcn Button has variants: default, destructive, outline, secondary, ghost, link.
  // We might need to use className for specific colors like 'long' (green) and 'short' (red).
  const getButtonClass = () => {
    if (isButtonDisabled)
      return 'opacity-60 cursor-not-allowed bg-secondary text-secondary-foreground';
    if (activeTab === 'long')
      return 'bg-long hover:bg-long-hover text-white shadow-lg shadow-long/20';
    if (activeTab === 'short')
      return 'bg-short hover:bg-short-hover text-white shadow-lg shadow-short/20';
    return 'bg-swap hover:bg-swap-hover text-white shadow-lg shadow-swap/20';
  };

  return (
    <Button
      onClick={onAction}
      disabled={isButtonDisabled}
      className={`w-full font-bold text-base h-12 ${getButtonClass()}`}
    >
      {(isRelayPending || isUSDCApprovalPending) && (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      )}
      {getButtonText()}
    </Button>
  );
};
