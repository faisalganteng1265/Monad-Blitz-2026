/**
 * Hook to fetch and manage user positions
 */

import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import type { Abi } from 'viem';
import { POSITION_MANAGER_ADDRESS } from '@/config/contracts';
import PositionManagerABI from '@/contracts/abis/PositionManager.json';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

const positionManagerAbi = PositionManagerABI as Abi;

export interface Position {
  id: bigint;
  trader: string;
  symbol: string;
  isLong: boolean;
  collateral: bigint;
  size: bigint;
  leverage: bigint;
  entryPrice: bigint;
  openTimestamp: bigint;
  status: number; // 0 = OPEN, 1 = CLOSED, 2 = LIQUIDATED
}

export function parsePositionData(data: unknown): Position | null {
  if (!data) return null;

  let position: Position;

  if (typeof data === 'object' && !Array.isArray(data)) {
    // Data is returned as an object with named properties or numeric keys
    const dataObj = data as any;
    const hasNumericKeys = '0' in dataObj && '1' in dataObj;

    if (hasNumericKeys) {
      position = {
        id: dataObj[0],
        trader: dataObj[1],
        symbol: dataObj[2],
        isLong: dataObj[3],
        collateral: dataObj[4],
        size: dataObj[5],
        leverage: dataObj[6],
        entryPrice: dataObj[7],
        openTimestamp: dataObj[8],
        status: dataObj[9],
      };
    } else {
      position = {
        id: dataObj.id,
        trader: dataObj.trader,
        symbol: dataObj.symbol,
        isLong: dataObj.isLong,
        collateral: dataObj.collateral,
        size: dataObj.size,
        leverage: dataObj.leverage,
        entryPrice: dataObj.entryPrice,
        openTimestamp: dataObj.openTimestamp,
        status: dataObj.status,
      };
    }
  } else {
    // Data is returned as an array (fallback)
    const positionArray = data as any[];
    position = {
      id: positionArray[0],
      trader: positionArray[1],
      symbol: positionArray[2],
      isLong: positionArray[3],
      collateral: positionArray[4],
      size: positionArray[5],
      leverage: positionArray[6],
      entryPrice: positionArray[7],
      openTimestamp: positionArray[8],
      status: positionArray[9],
    };
  }

  if (!position.id || position.id === 0n) {
    return null;
  }

  return position;
}

/**
 * Hook to get all user positions
 */
export function useUserPositions() {
  const { address } = useEmbeddedWallet();

  const {
    data: positionIds,
    isLoading: isLoadingIds,
    refetch: refetchIds,
  } = useReadContract({
    address: POSITION_MANAGER_ADDRESS,
    abi: positionManagerAbi,
    functionName: 'getUserPositions',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  });

  return {
    positionIds: (positionIds as bigint[]) || [],
    isLoading: isLoadingIds,
    refetch: refetchIds,
  };
}

/**
 * Hook to get single position details
 */
export function usePosition(positionId: bigint | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: POSITION_MANAGER_ADDRESS,
    abi: positionManagerAbi,
    functionName: 'getPosition',
    args: positionId !== undefined ? [positionId] : undefined,
    query: {
      enabled: positionId !== undefined,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  });

  // Parse position data from tuple
  if (!data) {
    return {
      position: null,
      isLoading,
      refetch,
    };
  }

  const position = parsePositionData(data);
  if (!position) {
    return {
      position: null,
      isLoading,
      refetch,
    };
  }

  return {
    position,
    isLoading,
    refetch,
  };
}

/**
 * Hook to get multiple position details by IDs
 */
export function usePositionsByIds(positionIds: bigint[]) {
  const contracts = useMemo(
    () =>
      positionIds.map((positionId) => ({
        address: POSITION_MANAGER_ADDRESS,
        abi: positionManagerAbi,
        functionName: 'getPosition',
        args: [positionId],
      })),
    [positionIds],
  );

  const { data, isLoading, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      refetchInterval: 5000,
    },
  });

  const positions = useMemo(() => {
    if (!data) return [];

    return data
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'object' && 'status' in item && item.status === 'failure') {
          return null;
        }
        const result = (item as { result?: unknown }).result ?? item;
        return parsePositionData(result);
      })
      .filter((position): position is Position => Boolean(position));
  }, [data]);

  return {
    positions,
    isLoading,
    refetch,
  };
}

/**
 * Hook to get all user positions with full details
 * Fetches each position individually since batch function may not exist
 */
export function useUserPositionsWithDetails() {
  const { positionIds, isLoading: isLoadingIds, refetch: refetchIds } = useUserPositions();

  // For now, just use the position IDs and fetch them individually in the component
  // This is a simpler approach that doesn't require a batch function
  return {
    positions: [],
    positionIds,
    allPositions: [],
    isLoading: isLoadingIds,
    refetch: refetchIds,
  };
}
