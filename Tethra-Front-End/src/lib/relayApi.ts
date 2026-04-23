/**
 * API client for gasless transaction relay service
 */

import { BACKEND_API_URL } from '@/config/contracts';

export interface RelayTransactionParams {
  to: string;
  data: string;
  userAddress: string;
  value?: string;
}

export interface RelayTransactionResult {
  txHash: string;
  gasUsed: string;
  usdcCharged: string;
  usdcChargedFormatted: string;
  explorerUrl: string;
}

export interface GasCostEstimate {
  estimatedGas: string;
  usdcCost: string;
  usdcCostFormatted: string;
}

export interface AffordabilityCheck {
  canAfford: boolean;
  userDeposit: string;
  requiredUsdc: string;
  depositFormatted: string;
  requiredFormatted: string;
}

export interface LimitExecutionFeeEstimate {
  orderType: string;
  gasEstimate: string;
  baseCost: string;
  baseCostFormatted: string;
  bufferBps: number;
  recommendedMaxExecutionFee: string;
  recommendedFormatted: string;
}

/**
 * Relay a transaction through backend (gasless)
 */
export async function relayTransaction(
  params: RelayTransactionParams,
): Promise<RelayTransactionResult> {
  const response = await fetch(`${BACKEND_API_URL}/api/relay/transaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || result.message || 'Failed to relay transaction');
  }

  return result.data;
}

/**
 * Get recommended execution fee for limit orders
 */
export async function getLimitExecutionFee(
  orderType: 'limit_open' | 'limit_close' | 'stop_loss' = 'limit_open',
  options: { estimatedGas?: string; bufferBps?: number } = {},
): Promise<LimitExecutionFeeEstimate> {
  const params = new URLSearchParams({ orderType });

  if (options.estimatedGas) {
    params.set('estimatedGas', options.estimatedGas);
  }

  if (options.bufferBps !== undefined) {
    params.set('bufferBps', options.bufferBps.toString());
  }

  const response = await fetch(
    `${BACKEND_API_URL}/api/relay/limit/execution-fee?${params.toString()}`,
  );
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Failed to estimate execution fee');
  }

  return result.data;
}
