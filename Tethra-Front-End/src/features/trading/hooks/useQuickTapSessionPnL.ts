import { useCallback, useEffect, useRef, useState } from 'react';
import { usePublicClient, useWatchContractEvent } from 'wagmi';
import type { Abi } from 'viem';
import { parseAbiItem } from 'viem';
import MarketExecutorAbi from '@/contracts/abis/MarketExecutor.json';
import PositionManagerAbi from '@/contracts/abis/PositionManager.json';
import { MARKET_EXECUTOR_ADDRESS, POSITION_MANAGER_ADDRESS, USDC_DECIMALS } from '@/config/contracts';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';
import { parsePositionData } from '@/hooks/data/usePositions';

const resolveAbi = (raw: unknown): Abi => {
  if (Array.isArray(raw)) return raw as Abi;
  if (raw && typeof raw === 'object' && 'abi' in raw) {
    return (raw as { abi: Abi }).abi;
  }
  return [] as Abi;
};

const marketExecutorAbi = resolveAbi(MarketExecutorAbi);
const positionManagerAbi = resolveAbi(PositionManagerAbi);

interface QuickTapSessionPnLOptions {
  enabled: boolean;
}

export const useQuickTapSessionPnL = ({ enabled }: QuickTapSessionPnLOptions) => {
  const { address } = useEmbeddedWallet();
  const publicClient = usePublicClient();
  const [sessionPnL, setSessionPnL] = useState(0);
  const seenLogsRef = useRef<Set<string>>(new Set());
  const lastCheckedBlockRef = useRef<bigint | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setSessionPnL(0);
    seenLogsRef.current.clear();
    lastCheckedBlockRef.current = null;
  }, [enabled, address]);

  const applyPnL = useCallback((pnl: bigint) => {
    const delta = Number(pnl) / 10 ** USDC_DECIMALS;
    if (!Number.isFinite(delta)) return;
    setSessionPnL((prev) => prev + delta);
  }, []);

  const handleMarketLogs = useCallback(
    (logs: any[]) => {
      if (!enabled || !address) return;

      logs.forEach((log) => {
        const logKey = `${log.transactionHash}-${log.logIndex}`;
        if (seenLogsRef.current.has(logKey)) return;
        seenLogsRef.current.add(logKey);

        const trader = (log.args?.trader as string | undefined)?.toLowerCase();
        if (!trader || trader !== address.toLowerCase()) return;

        const pnl = log.args?.pnl as bigint | undefined;
        if (pnl === undefined) return;

        const positionId = log.args?.positionId as bigint | undefined;
        if (!positionId || !publicClient) {
          applyPnL(pnl);
          return;
        }

        publicClient
          .readContract({
            address: POSITION_MANAGER_ADDRESS,
            abi: positionManagerAbi,
            functionName: 'getPosition',
            args: [positionId],
          })
          .then((data) => {
            const position = parsePositionData(data);
            if (!position) return;
            if (position.leverage === 1000n) {
              applyPnL(pnl);
            }
          })
          .catch(() => {
            applyPnL(pnl);
          });
      });
    },
    [address, applyPnL, enabled, publicClient],
  );

  const handlePositionClosedLogs = useCallback(
    (logs: any[]) => {
      if (!enabled || !address || !publicClient) return;

      logs.forEach((log) => {
        const logKey = `${log.transactionHash}-${log.logIndex}`;
        if (seenLogsRef.current.has(logKey)) return;
        seenLogsRef.current.add(logKey);

        const pnl = log.args?.pnl as bigint | undefined;
        const positionId = log.args?.positionId as bigint | undefined;
        if (pnl === undefined || !positionId) return;

        publicClient
          .readContract({
            address: POSITION_MANAGER_ADDRESS,
            abi: positionManagerAbi,
            functionName: 'getPosition',
            args: [positionId],
          })
          .then((data) => {
            const position = parsePositionData(data);
            if (!position) return;
            if (position.trader.toLowerCase() !== address.toLowerCase()) return;
            if (position.leverage === 1000n) {
              applyPnL(pnl);
            }
          })
          .catch(() => {
            // ignore
          });
      });
    },
    [address, applyPnL, enabled, publicClient],
  );

  useWatchContractEvent({
    address: MARKET_EXECUTOR_ADDRESS,
    abi: marketExecutorAbi,
    eventName: 'PositionClosedMarket',
    onLogs: handleMarketLogs,
    enabled: enabled && Boolean(address),
  });

  useWatchContractEvent({
    address: POSITION_MANAGER_ADDRESS,
    abi: positionManagerAbi,
    eventName: 'PositionClosed',
    onLogs: handlePositionClosedLogs,
    enabled: enabled && Boolean(address),
  });

  useEffect(() => {
    if (!enabled || !address || !publicClient) return;

    let isActive = true;
    const poll = async () => {
      if (!isActive) return;
      try {
        const latestBlock = await publicClient.getBlockNumber();
        if (lastCheckedBlockRef.current === null) {
          lastCheckedBlockRef.current = latestBlock;
          return;
        }

        if (latestBlock <= lastCheckedBlockRef.current) return;
        const fromBlock = lastCheckedBlockRef.current + 1n;
        const toBlock = latestBlock;

        const marketLogs = await publicClient.getLogs({
          address: MARKET_EXECUTOR_ADDRESS,
          event: parseAbiItem(
            'event PositionClosedMarket(uint256 indexed positionId,address indexed trader,uint256 exitPrice,int256 pnl,uint256 fee)',
          ),
          fromBlock,
          toBlock,
        });

        if (marketLogs.length > 0) {
          handleMarketLogs(marketLogs as any[]);
        }

        const positionLogs = await publicClient.getLogs({
          address: POSITION_MANAGER_ADDRESS,
          event: parseAbiItem(
            'event PositionClosed(uint256 indexed positionId,uint256 exitPrice,int256 pnl)',
          ),
          fromBlock,
          toBlock,
        });

        if (positionLogs.length > 0) {
          handlePositionClosedLogs(positionLogs as any[]);
        }

        lastCheckedBlockRef.current = latestBlock;
      } catch {
        // ignore polling errors
      }
    };

    const interval = setInterval(poll, 4000);
    poll();

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [address, enabled, handleMarketLogs, handlePositionClosedLogs, publicClient]);

  return { sessionPnL };
};
