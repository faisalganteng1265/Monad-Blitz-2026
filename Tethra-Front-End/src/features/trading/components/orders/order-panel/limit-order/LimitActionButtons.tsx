import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface LimitActionButtonsProps {
  activeTab: 'long' | 'short' | 'swap';
  authenticated: boolean;
  isProcessing: boolean;
  isUSDCApprovalPending?: boolean;
  payAmount: string;
  limitPrice: string;
  hasLargeAllowance: boolean;
  hasInsufficientBalance?: boolean;
  onAction: () => void;
}

export const LimitActionButtons: React.FC<LimitActionButtonsProps> = ({
  activeTab,
  authenticated,
  isProcessing,
  isUSDCApprovalPending,
  payAmount,
  limitPrice,
  hasLargeAllowance,
  hasInsufficientBalance,
  onAction,
}) => {
  const needsActivation = !hasLargeAllowance;
  const isInsufficient = Boolean(hasInsufficientBalance);
  const isButtonDisabled =
    !authenticated ||
    isInsufficient ||
    isProcessing ||
    isUSDCApprovalPending ||
    (!needsActivation && (!payAmount || !limitPrice));

  // Variant mapping
  const getButtonClass = () => {
    if (isButtonDisabled)
      return 'opacity-60 cursor-not-allowed bg-secondary text-secondary-foreground';
    if (activeTab === 'long')
      return 'bg-long hover:bg-long-hover text-white shadow-lg shadow-long/20';
    if (activeTab === 'short')
      return 'bg-short hover:bg-short-hover text-white shadow-lg shadow-short/20';
    return 'bg-swap hover:bg-swap-hover text-white shadow-lg shadow-swap/20';
  };

  const getButtonText = () => {
    if (!authenticated) return 'Connect Wallet';
    if (isInsufficient) return 'Insufficient Balance';
    if (needsActivation) return isUSDCApprovalPending ? 'Activating Trading...' : 'Activate Trading';
    if (isUSDCApprovalPending) return 'Approving USDC...';
    if (isProcessing) return 'Processing...';
    if (!payAmount) return 'Enter Amount';
    if (!limitPrice) return 'Enter Limit Price';

    if ((activeTab === 'long' || activeTab === 'short') && !hasLargeAllowance) {
      return `Approve & Create ${activeTab === 'long' ? 'Long' : 'Short'} Order`;
    }

    return `Create Limit ${activeTab === 'long' ? 'Long' : 'Short'} Order`;
  };

  return (
    <Button
      onClick={onAction}
      disabled={isButtonDisabled}
      className={`w-full font-bold text-base h-12 ${getButtonClass()}`}
    >
      {(isProcessing || isUSDCApprovalPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {getButtonText()}
    </Button>
  );
};
