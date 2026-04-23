import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';

const VAULT_POOL = process.env.NEXT_PUBLIC_VAULT_POOL_ADDRESS as `0x${string}`;
const STABILITY_FUND = process.env.NEXT_PUBLIC_STABILITY_FUND_ADDRESS as `0x${string}`;
const TETHRA_STAKING = process.env.NEXT_PUBLIC_TETHRA_STAKING_ADDRESS as `0x${string}`;
const USDC_TOKEN = process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS as `0x${string}`;

const vaultPoolABI = [
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const stakingABI = [
  {
    inputs: [],
    name: 'totalStaked',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalRewardsDistributed',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'rewardsPer7Days', type: 'uint256' }],
    name: 'calculateAPR',
    outputs: [{ internalType: 'uint256', name: 'apr', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const erc20ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface PoolData {
  totalTVL: string;
  vaultTVL: string;
  stabilityBuffer: string;
  stakingTVL: string;
  totalFeesCollected: string;
  stakingAPR: string;
  totalRewardsDistributed: string;
  isLoading: boolean;
  error: string | null;
}

export const usePoolData = (): PoolData => {
  const [data, setData] = useState<PoolData>({
    totalTVL: '0',
    vaultTVL: '0',
    stabilityBuffer: '0',
    stakingTVL: '0',
    totalFeesCollected: '0',
    stakingAPR: '0',
    totalRewardsDistributed: '0',
    isLoading: true,
    error: null,
  });

  const publicClient = usePublicClient();

  useEffect(() => {
    const fetchPoolData = async () => {
      if (!publicClient) return;

      try {
        setData((prev) => ({
          ...prev,
          isLoading: prev.totalTVL === '0',
          error: null,
        }));

        const [vaultAssets, bufferBalance, stakingTVL, stakingRewards] = await Promise.all([
          publicClient.readContract({
            address: VAULT_POOL,
            abi: vaultPoolABI,
            functionName: 'totalAssets',
          }),
          publicClient.readContract({
            address: USDC_TOKEN,
            abi: erc20ABI,
            functionName: 'balanceOf',
            args: [STABILITY_FUND],
          }),
          publicClient.readContract({
            address: TETHRA_STAKING,
            abi: stakingABI,
            functionName: 'totalStaked',
          }),
          publicClient.readContract({
            address: TETHRA_STAKING,
            abi: stakingABI,
            functionName: 'totalRewardsDistributed',
          }),
        ]);

        const stakingAPR = await publicClient
          .readContract({
            address: TETHRA_STAKING,
            abi: stakingABI,
            functionName: 'calculateAPR',
            args: [BigInt(3)],
          })
          .catch(() => BigInt(1500));

        const stakingValue = Number(formatUnits(stakingTVL as bigint, 18)); // assume $1 peg
        const vaultValue = Number(formatUnits(vaultAssets as bigint, 6));
        const bufferValue = Number(formatUnits(bufferBalance as bigint, 6));
        const totalTVLValue = vaultValue + bufferValue + stakingValue;

        setData({
          totalTVL: formatCurrency(totalTVLValue),
          vaultTVL: formatCurrency(vaultValue),
          stabilityBuffer: formatCurrency(bufferValue),
          stakingTVL: `${formatTokens(Number(formatUnits(stakingTVL as bigint, 18)))} TETH`,
          totalFeesCollected: formatCurrency(0),
          stakingAPR: `${(Number(stakingAPR) / 10000).toFixed(2)}%`,
          totalRewardsDistributed: formatCurrency(Number(formatUnits(stakingRewards as bigint, 6))),
          isLoading: false,
          error: null,
        });
      } catch (error) {
        setData((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    };

    fetchPoolData();
    const interval = setInterval(fetchPoolData, 60000);
    return () => clearInterval(interval);
  }, [publicClient]);

  return data;
};

const formatCurrency = (value: number): string => {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatTokens = (value: number): string => {
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
};

export default usePoolData;
