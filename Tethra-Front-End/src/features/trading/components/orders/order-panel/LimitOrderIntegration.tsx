/**
 * Limit Order Integration Component
 *
 * Component ini bisa di-copy paste ke LimitOrder.tsx yang sudah ada
 * untuk menambahkan fungsi submit limit order ke backend
 */

'use client';

import { useState } from 'react';
import {
  useCreateLimitOpenOrder,
  useApproveUSDCForLimitOrders,
  useExecutionFee,
  useLimitExecutorConfig,
  calculateLimitOrderCost,
} from '@/features/trading/hooks/useLimitOrder';
import { toast } from 'sonner';

export function useLimitOrderSubmit() {
  const {
    createOrder,
    isPending: isCreatingOrder,
    isSuccess,
    submission,
  } = useCreateLimitOpenOrder();
  const { approve, hasAllowance, isPending: isApproving } = useApproveUSDCForLimitOrders();
  const { executionFee, executionFeeFormatted, error: executionFeeError } = useExecutionFee();
  const { tradingFeeBps } = useLimitExecutorConfig();
  const [isProcessing, setIsProcessing] = useState(false);

  const submitLimitOrder = async (params: {
    symbol: string;
    isLong: boolean;
    collateral: string;
    leverage: number;
    triggerPrice: string;
    takeProfit?: string; // Optional TP price (8 decimals)
    stopLoss?: string; // Optional SL price (8 decimals)
  }) => {
    try {
      setIsProcessing(true);

      // 1. Validate inputs
      if (!params.collateral || parseFloat(params.collateral) <= 0) {
        toast.error('Please enter collateral amount');
        return false;
      }

      if (!params.triggerPrice || parseFloat(params.triggerPrice) <= 0) {
        toast.error('Please enter trigger price');
        return false;
      }

      // 2. Calculate total cost (collateral + trading fee + execution fee)
      const cost = calculateLimitOrderCost({
        collateralUsd: params.collateral,
        leverage: params.leverage,
        executionFee: executionFee ?? BigInt(0),
        tradingFeeBps,
      });

      if (cost.totalCost === BigInt(0)) {
        toast.error('Invalid order amount');
        return false;
      }

      // 3. Check and approve USDC if needed (UNLIMITED APPROVAL - once only!)
      const UNLIMITED_APPROVAL = '1000000000'; // 1B USDC (effectively unlimited)
      if (!hasAllowance(cost.totalCostFormatted)) {
        toast.loading('Approving USDC for limit orders (one-time only)...', {
          id: 'limit-order-approve',
        });
        await approve(UNLIMITED_APPROVAL);
        toast.success('USDC approved! You can now create limit orders without approval.', {
          id: 'limit-order-approve',
        });
      }

      // 4. Create limit order (sign + submit to keeper) - GASLESS!
      toast.loading('Signing limit order (gasless)...', { id: 'limit-order-create' });
      await createOrder({
        symbol: params.symbol,
        isLong: params.isLong,
        collateral: params.collateral,
        leverage: params.leverage,
        triggerPrice: params.triggerPrice,
        takeProfit: params.takeProfit,
        stopLoss: params.stopLoss,
      });

      // Show success message with TP/SL info if configured
      let successMsg = 'Limit order created successfully!';
      if (params.takeProfit || params.stopLoss) {
        successMsg += ' Auto TP/SL will be set when order executes.';
      }
      toast.success(successMsg, { id: 'limit-order-create', duration: 5000 });
      return true;
    } catch (error) {
      console.error('Error creating limit order:', error);
      toast.error('Failed to create limit order', { id: 'limit-order-create' });
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    submitLimitOrder,
    isProcessing: isProcessing || isApproving || isCreatingOrder,
    isSuccess,
    lastSubmission: submission,
    executionFee: executionFeeFormatted,
    executionFeeError,
  };
}

/**
 * CARA PAKAI:
 *
 * 1. Import hook ini di LimitOrder.tsx:
 *
 *    import { useLimitOrderSubmit } from './LimitOrderIntegration';
 *
 * 2. Tambahkan di dalam component:
 *
 *    const { submitLimitOrder, isProcessing, executionFee } = useLimitOrderSubmit();
 *    const [limitPrice, setLimitPrice] = useState<string>('');
 *
 * 3. Tambahkan state untuk limit price (line ~165):
 *
 *    const [limitPrice, setLimitPrice] = useState<string>('');
 *
 * 4. Update input "Limit Price" (line 458-491) untuk menggunakan state:
 *
 *    <input
 *      type="text"
 *      placeholder="0.0"
 *      value={limitPrice}
 *      onChange={(e) => {
 *        const value = e.target.value;
 *        if (value === '' || /^\d*\.?\d*$/.test(value)) {
 *          setLimitPrice(value);
 *        }
 *      }}
 *      className="bg-transparent text-xl text-white outline-none w-full"
 *    />
 *
 * 5. Replace "Enter an amount" section (line 715-718) dengan button:
 *
 *    <button
 *      onClick={() => submitLimitOrder({
 *        symbol: activeMarket.symbol,
 *        isLong: activeTab === 'long',
 *        collateral: payAmount,
 *        leverage,
 *        triggerPrice: limitPrice,
 *      })}
 *      disabled={!payAmount || !limitPrice || isProcessing}
 *      className={`w-full py-4 rounded-lg font-semibold text-sm transition-all cursor-pointer ${
 *        !payAmount || !limitPrice || isProcessing
 *          ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
 *          : activeTab === 'long'
 *          ? 'bg-green-500 hover:bg-green-600 text-white'
 *          : activeTab === 'short'
 *          ? 'bg-red-500 hover:bg-red-600 text-white'
 *          : 'bg-blue-500 hover:bg-blue-600 text-white'
 *      }`}
 *    >
 *      {isProcessing ? 'Processing...' : `Create Limit ${activeTab === 'long' ? 'Long' : 'Short'} Order`}
 *    </button>
 *
 * 6. Tampilkan execution fee info (di bawah Collateral In, sekitar line 614):
 *
 *    <div className="flex justify-between items-center text-sm">
 *      <div className="flex items-center gap-1">
 *        <span className="text-gray-400">Execution Fee</span>
 *        <Info size={12} className="text-gray-500" />
 *      </div>
 *      <span className="text-white">${executionFee} USDC</span>
 *    </div>
 *
 * DONE! Limit order sudah terintegrasi penuh 🎉
 */
