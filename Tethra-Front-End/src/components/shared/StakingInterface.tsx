'use client';

import React, { useState } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Coins, TrendingUp, Clock, AlertCircle } from 'lucide-react';

const TETHRA_STAKING = process.env.NEXT_PUBLIC_TETHRA_STAKING_ADDRESS as `0x${string}`;
const TETHRA_TOKEN = process.env.NEXT_PUBLIC_TETHRA_TOKEN_ADDRESS as `0x${string}`;

const stakingABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'stake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'unstake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'claimRewards',
    outputs: [],
    stateMutability: 'nonpayable',
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
  {
    inputs: [],
    name: 'totalStaked',
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

const tokenABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

interface StakingInterfaceProps {
  className?: string;
}

export default function StakingInterface({ className = '' }: StakingInterfaceProps) {
  const { address } = useAccount();
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'stake' | 'unstake'>('stake');

  // Contract reads
  const { data: userBalance } = useReadContract({
    address: TETHRA_TOKEN,
    abi: tokenABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { data: allowance } = useReadContract({
    address: TETHRA_TOKEN,
    abi: tokenABI,
    functionName: 'allowance',
    args: address ? [address, TETHRA_STAKING] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { data: userStakeInfo } = useReadContract({
    address: TETHRA_STAKING,
    abi: stakingABI,
    functionName: 'getUserStakeInfo',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { data: totalStaked } = useReadContract({
    address: TETHRA_STAKING,
    abi: stakingABI,
    functionName: 'totalStaked',
  });

  const { data: currentAPR } = useReadContract({
    address: TETHRA_STAKING,
    abi: stakingABI,
    functionName: 'calculateAPR',
    args: [BigInt(10000 * 1e6)], // Simulate 10k USDC weekly rewards
  });

  // Contract writes
  const { writeContractAsync } = useWriteContract();

  // Format user data
  const formatBalance = (balance?: bigint) => {
    if (!balance) return '0';
    return Number(formatUnits(balance, 18)).toFixed(2);
  };

  const formatUSDC = (amount?: bigint) => {
    if (!amount) return '0';
    return Number(formatUnits(amount, 6)).toFixed(2);
  };

  const userStakedAmount = userStakeInfo ? userStakeInfo[0] : BigInt(0);
  const pendingRewards = userStakeInfo ? userStakeInfo[1] : BigInt(0);
  const canUnstakeWithoutPenalty = userStakeInfo ? userStakeInfo[3] : false;

  const needsApproval = (amount: string) => {
    if (!amount || !allowance) return false;
    const amountBigInt = parseUnits(amount, 18);
    return allowance < amountBigInt;
  };

  const handleApprove = async (amount: string) => {
    try {
      const amountBigInt = parseUnits(amount, 18);
      await writeContractAsync({
        address: TETHRA_TOKEN,
        abi: tokenABI,
        functionName: 'approve',
        args: [TETHRA_STAKING, amountBigInt],
      });
    } catch (error) {
      console.error('Approval failed:', error);
    }
  };

  const handleStake = async () => {
    if (!stakeAmount) return;
    
    try {
      if (needsApproval(stakeAmount)) {
        await handleApprove(stakeAmount);
        return;
      }
      
      const amountBigInt = parseUnits(stakeAmount, 18);
      await writeContractAsync({
        address: TETHRA_STAKING,
        abi: stakingABI,
        functionName: 'stake',
        args: [amountBigInt],
      });
      setStakeAmount('');
    } catch (error) {
      console.error('Staking failed:', error);
    }
  };

  const handleUnstake = async () => {
    if (!unstakeAmount) return;
    
    try {
      const amountBigInt = parseUnits(unstakeAmount, 18);
      await writeContractAsync({
        address: TETHRA_STAKING,
        abi: stakingABI,
        functionName: 'unstake',
        args: [amountBigInt],
      });
      setUnstakeAmount('');
    } catch (error) {
      console.error('Unstaking failed:', error);
    }
  };

  const handleClaim = async () => {
    try {
      await writeContractAsync({
        address: TETHRA_STAKING,
        abi: stakingABI,
        functionName: 'claimRewards',
      });
    } catch (error) {
      console.error('Claim failed:', error);
    }
  };

  return (
    <div className={`bg-slate-900/50 rounded-lg border border-slate-800 p-6 ${className}`}>
      <div className="flex items-center gap-2 mb-6">
        <Coins className="text-blue-400" size={24} />
        <h2 className="text-xl font-bold text-white">TETH Staking</h2>
      </div>

      {/* Staking Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-green-400" />
            <span className="text-sm text-gray-400">Current APR</span>
          </div>
          <p className="text-lg font-semibold text-white">
            {currentAPR ? `${Number(currentAPR) / 100}%` : '0%'}
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Coins size={16} className="text-blue-400" />
            <span className="text-sm text-gray-400">Total Staked</span>
          </div>
          <p className="text-lg font-semibold text-white">
            {totalStaked ? `${formatBalance(totalStaked)} TETH` : '0 TETH'}
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-yellow-400" />
            <span className="text-sm text-gray-400">Lock Period</span>
          </div>
          <p className="text-lg font-semibold text-white">7 days</p>
        </div>
      </div>

      {address ? (
        <>
          {/* User Stats */}
          <div className="bg-slate-800/30 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-white mb-3">Your Staking</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-400">Staked Amount</p>
                <p className="font-semibold text-white">{formatBalance(userStakedAmount)} TETH</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Pending Rewards</p>
                <p className="font-semibold text-green-400">{formatUSDC(pendingRewards)} USDC</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Available Balance</p>
                <p className="font-semibold text-white">{formatBalance(userBalance)} TETH</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-800/30 rounded-lg p-1 mb-6">
            <button
              onClick={() => setActiveTab('stake')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'stake'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Stake
            </button>
            <button
              onClick={() => setActiveTab('unstake')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'unstake'
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Unstake
            </button>
          </div>

          {/* Stake Tab */}
          {activeTab === 'stake' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Amount to Stake
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => setStakeAmount(formatBalance(userBalance))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 text-sm hover:text-blue-300"
                  >
                    MAX
                  </button>
                </div>
              </div>
              
              <button
                onClick={handleStake}
                disabled={!stakeAmount || Number(stakeAmount) <= 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
              >
                {needsApproval(stakeAmount) ? 'Approve TETH' : 'Stake TETH'}
              </button>
            </div>
          )}

          {/* Unstake Tab */}
          {activeTab === 'unstake' && (
            <div className="space-y-4">
              {!canUnstakeWithoutPenalty && Number(formatBalance(userStakedAmount)) > 0 && (
                <div className="flex items-start gap-2 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                  <AlertCircle size={16} className="text-yellow-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-400 font-medium">Early Unstaking Penalty</p>
                    <p className="text-xs text-yellow-300">10% penalty applies for unstaking within 7 days</p>
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Amount to Unstake
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={unstakeAmount}
                    onChange={(e) => setUnstakeAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-red-500"
                  />
                  <button
                    onClick={() => setUnstakeAmount(formatBalance(userStakedAmount))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-red-400 text-sm hover:text-red-300"
                  >
                    MAX
                  </button>
                </div>
              </div>
              
              <button
                onClick={handleUnstake}
                disabled={!unstakeAmount || Number(unstakeAmount) <= 0}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
              >
                Unstake TETH
              </button>
            </div>
          )}

          {/* Claim Rewards */}
          {Number(formatUSDC(pendingRewards)) > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-700">
              <button
                onClick={handleClaim}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition-colors"
              >
                Claim {formatUSDC(pendingRewards)} USDC Rewards
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-400">Connect your wallet to start staking TETH</p>
        </div>
      )}
    </div>
  );
}