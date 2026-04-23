'use client';

import React, { useState, useEffect } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import Link from 'next/link';
import Image from 'next/image';
import { usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import usePoolData from '@/hooks/data/usePoolData';
import { useEmbeddedWallet } from '@/features/wallet/hooks/useEmbeddedWallet';

const TETHRA_TOKEN = process.env.NEXT_PUBLIC_TETHRA_TOKEN_ADDRESS as `0x${string}`;
const TETHRA_STAKING = process.env.NEXT_PUBLIC_TETHRA_STAKING_ADDRESS as `0x${string}`;

const tokenABI = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
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
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getUserStakeInfo',
    outputs: [
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint256', name: 'pendingRewards', type: 'uint256' },
      { internalType: 'uint256', name: 'stakedAt', type: 'uint256' },
      { internalType: 'bool', name: 'canUnstakeWithoutPenalty', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export default function StakePage() {
  const publicClient = usePublicClient();
  const { address } = useEmbeddedWallet();
  const poolData = usePoolData();

  const [totalSupply, setTotalSupply] = useState<bigint>(BigInt(0));
  const [totalStaked, setTotalStaked] = useState<bigint>(BigInt(0));
  const [userBalance, setUserBalance] = useState<bigint>(BigInt(0));
  const [userStaked, setUserStaked] = useState<bigint>(BigInt(0));
  const [pendingRewards, setPendingRewards] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(true);

  const userAddress = address;

  useEffect(() => {
    const fetchData = async () => {
      if (!publicClient) {
        setIsLoading(false);
        return;
      }

      try {
        // Fetch total supply and total staked
        const [supply, staked] = await Promise.all([
          publicClient.readContract({
            address: TETHRA_TOKEN,
            abi: tokenABI,
            functionName: 'totalSupply',
          }),
          publicClient.readContract({
            address: TETHRA_STAKING,
            abi: stakingABI,
            functionName: 'totalStaked',
          }),
        ]);

        setTotalSupply(supply as bigint);
        setTotalStaked(staked as bigint);

        // Fetch user-specific data if wallet is connected
        if (userAddress) {
          const [balance, stakeInfo] = await Promise.all([
            publicClient.readContract({
              address: TETHRA_TOKEN,
              abi: tokenABI,
              functionName: 'balanceOf',
              args: [userAddress as `0x${string}`],
            }),
            publicClient.readContract({
              address: TETHRA_STAKING,
              abi: stakingABI,
              functionName: 'getUserStakeInfo',
              args: [userAddress as `0x${string}`],
            }),
          ]);

          setUserBalance(balance as bigint);
          if (stakeInfo && Array.isArray(stakeInfo)) {
            setUserStaked(stakeInfo[0] as bigint);
            setPendingRewards(stakeInfo[1] as bigint);
          }
        }

        setIsLoading(false);
      } catch (error) {
        setIsLoading(false);
      }
    };

    fetchData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [publicClient, userAddress]);

  // Calculate percentage of total
  const percentOfTotal =
    totalStaked > BigInt(0) ? (Number(userStaked) / Number(totalStaked)) * 100 : 0;

  return (
    <PageLayout
      navbar={{
        title: 'Stake TETHRA',
        subtitle: 'Buy and stake TETHRA to receive trading fees from traders',
      }}
      disableMobileHeaderContent
    >
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Stake TETHRA</h1>
        <p className="text-gray-400 text-sm">
          <Link href="#" className="text-blue-400 hover:text-blue-300 underline">
            Buy
          </Link>{' '}
          and stake TETHRA to receive trading fees from traders.
        </p>
      </div>

      {/* Staking Table */}
      <div className="bg-slate-900/30 rounded-lg border border-slate-800 overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-800">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Asset</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">
                  Total Supply
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">
                  Total Staked
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">
                  Historical APR
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">
                  7 days APR
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">
                  Your Stake
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Available</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-slate-800/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Image
                      src="/tethra-logo.png"
                      alt="TETH"
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                    <span className="font-medium text-white">TETH</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-white">
                    {isLoading
                      ? '...'
                      : Number(formatUnits(totalSupply, 18)).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-white">
                    {isLoading
                      ? '...'
                      : Number(formatUnits(totalStaked, 18)).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-white">{poolData.stakingAPR || '-'}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-white">-</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-white">
                    {isLoading
                      ? '...'
                      : Number(formatUnits(userStaked, 18)).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-white">
                    {isLoading
                      ? '...'
                      : Number(formatUnits(userBalance, 18)).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-white">
                    {isLoading ? '...' : `${percentOfTotal.toFixed(2)}%`}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Earnings Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Earnings to Collect</h2>
        <p className="text-gray-400 text-sm mb-6">
          TETHRA revenue is paid directly in the underlying collateral.
        </p>

        {/* Token Tabs */}
        <div className="flex gap-4 mb-6 overflow-x-auto">
          <button className="px-4 py-2 rounded-lg bg-slate-800/50 text-white font-medium border border-slate-700 hover:bg-slate-700/50 transition-colors whitespace-nowrap flex items-center gap-2">
            <Image
              src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
              alt="USDC"
              width={20}
              height={20}
              className="rounded-full"
            />
            USDC
          </button>
          {/* <button className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors whitespace-nowrap">
            Total
          </button> */}
        </div>

        {/* Earnings Display or Empty State */}
        {pendingRewards > BigInt(0) ? (
          <div className="bg-slate-900/30 rounded-lg border border-slate-800 p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-gray-400 text-sm mb-1">Total Earnings</p>
                <h3 className="text-3xl font-bold text-white">
                  {Number(formatUnits(pendingRewards, 6)).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  USDC
                </h3>
              </div>
              <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                Claim Rewards
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800/30 rounded-lg p-4">
                <p className="text-gray-400 text-xs mb-1">Your Stake</p>
                <p className="text-white font-semibold">
                  {Number(formatUnits(userStaked, 18)).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  TETH
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-4">
                <p className="text-gray-400 text-xs mb-1">% of Total Staked</p>
                <p className="text-white font-semibold">{percentOfTotal.toFixed(2)}%</p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-4">
                <p className="text-gray-400 text-xs mb-1">Current APR</p>
                <p className="text-white font-semibold">{poolData.stakingAPR || '-'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/30 rounded-lg border border-slate-800 p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No earnings to collect</h3>
              <p className="text-gray-400">Stake TETHRA to start earning rewards.</p>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
