import { BACKEND_API_URL } from '@/config/contracts';

export interface LimitOpenOrderRequest {
  trader: string;
  symbol: string;
  isLong: boolean;
  collateral: string; // base units (USDC 6 decimals)
  leverage: string; // integer string
  triggerPrice: string; // base units (8 decimals)
  nonce: string;
  expiresAt: string;
  signature: `0x${string}`;
  takeProfit?: string; // optional TP price (8 decimals)
  stopLoss?: string; // optional SL price (8 decimals)
  metadata?: {
    collateralUsd?: string;
    triggerPriceUsd?: string;
  };
}

export interface LimitOrderSubmissionResponse {
  orderId: string;
  txHash: string;
  explorerUrl?: string;
}

export async function submitLimitOpenOrder(
  payload: LimitOpenOrderRequest
): Promise<LimitOrderSubmissionResponse> {
  const response = await fetch(`${BACKEND_API_URL}/api/limit-orders/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || result.message || 'Failed to submit limit order');
  }

  return result.data as LimitOrderSubmissionResponse;
}
