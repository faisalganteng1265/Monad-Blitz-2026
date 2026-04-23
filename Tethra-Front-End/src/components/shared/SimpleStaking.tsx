'use client';

import React, { useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { usePublicClient } from 'wagmi';
import { formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { Coins, TrendingUp, Clock } from 'lucide-react';
import usePoolData from '@/hooks/data/usePoolData';

const TETHRA_TOKEN = process.env.NEXT_PUBLIC_TETHRA_TOKEN_ADDRESS as `0x${string}`;
const TETHRA_STAKING = process.env.NEXT_PUBLIC_TETHRA_STAKING_ADDRESS as `0x${string}`;

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

const stakingABI = [
  {
    inputs: [],
    name: 'totalStaked',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'stake',
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
] as const;

interface SimpleStakingProps {
  className?: string;
}

export default function SimpleStaking({ className = '' }: SimpleStakingProps) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const publicClient = usePublicClient();
  const poolData = usePoolData();

  // State for contract data
  const [userBalance, setUserBalance] = useState<bigint>(BigInt(0));
  const [totalStaked, setTotalStaked] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [userStakedAmount, setUserStakedAmount] = useState<bigint>(BigInt(0));
  const [pendingRewards, setPendingRewards] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(true);
  const [stakeAmount, setStakeAmount] = useState('');
  const [isTransacting, setIsTransacting] = useState(false);

  // Get external wallet (MetaMask, etc.) for staking - not embedded wallet
  const externalWallet = wallets.find(
    (wallet) =>
      wallet.walletClientType === 'metamask' ||
      wallet.walletClientType === 'coinbase_wallet' ||
      wallet.walletClientType === 'wallet_connect' ||
      (wallet.walletClientType !== 'privy' && wallet.connectorType !== 'embedded'),
  );
  const userAddress = externalWallet?.address;

  // Fetch contract data function (reusable)
  const fetchContractData = async () => {
    if (!publicClient || !userAddress) {
      setIsLoading(false);
      return;
    }

    try {
      const [balance, staked, currentAllowance, userStakeInfo] = await Promise.all([
        publicClient.readContract({
          address: TETHRA_TOKEN,
          abi: tokenABI,
          functionName: 'balanceOf',
          args: [userAddress as `0x${string}`],
        }),
        publicClient.readContract({
          address: TETHRA_STAKING,
          abi: stakingABI,
          functionName: 'totalStaked',
        }),
        publicClient.readContract({
          address: TETHRA_TOKEN,
          abi: tokenABI,
          functionName: 'allowance',
          args: [userAddress as `0x${string}`, TETHRA_STAKING],
        }),
        publicClient.readContract({
          address: TETHRA_STAKING,
          abi: stakingABI,
          functionName: 'getUserStakeInfo',
          args: [userAddress as `0x${string}`],
        }),
      ]);

      setUserBalance(balance as bigint);
      setTotalStaked(staked as bigint);
      setAllowance(currentAllowance as bigint);

      // Parse user stake info
      if (userStakeInfo && Array.isArray(userStakeInfo)) {
        setUserStakedAmount(userStakeInfo[0] as bigint);
        setPendingRewards(userStakeInfo[1] as bigint);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching contract data:', error);
      setIsLoading(false);
    }
  };

  // Fetch contract data on component mount and when dependencies change
  useEffect(() => {
    fetchContractData();
  }, [publicClient, userAddress]);

  const switchToBaseSepolia = async () => {
    if (!window.ethereum) return;

    try {
      // Try to switch to Base Sepolia
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x14a34' }], // 84532 in hex
      });
    } catch (switchError: any) {
      // Chain not added to MetaMask, add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x14a34',
                chainName: 'Base Sepolia',
                nativeCurrency: {
                  name: 'ETH',
                  symbol: 'ETH',
                  decimals: 18,
                },
                rpcUrls: ['https://sepolia.base.org'],
                blockExplorerUrls: ['https://sepolia.basescan.org'],
              },
            ],
          });
        } catch (addError) {
          console.error('Failed to add Base Sepolia network:', addError);
          throw new Error('Please add Base Sepolia network to MetaMask manually');
        }
      } else {
        console.error('Failed to switch network:', switchError);
        throw switchError;
      }
    }
  };

  const handleApproveAndStake = async () => {
    if (!stakeAmount || !userAddress) {
      alert('Please enter an amount and make sure wallet is connected');
      return;
    }

    if (!window.ethereum) {
      alert('Please install MetaMask or connect an external wallet');
      return;
    }

    setIsTransacting(true);

    try {
      // Switch to Base Sepolia first
      await switchToBaseSepolia();

      const amount = parseUnits(stakeAmount, 18);

      // Check if approval is needed
      if (allowance < amount) {
        // Prepare approve transaction data
        const approveData = encodeFunctionData({
          abi: tokenABI,
          functionName: 'approve',
          args: [TETHRA_STAKING, amount],
        });

        // Send approve transaction
        const approveTxHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: userAddress,
              to: TETHRA_TOKEN,
              data: approveData,
            },
          ],
        });

        // Wait for approval to be confirmed
        await publicClient!.waitForTransactionReceipt({ hash: approveTxHash });

        // Refresh allowance
        const newAllowance = await publicClient!.readContract({
          address: TETHRA_TOKEN,
          abi: tokenABI,
          functionName: 'allowance',
          args: [userAddress as `0x${string}`, TETHRA_STAKING],
        });
        setAllowance(newAllowance);
      }

      // Prepare stake transaction data
      const stakeData = encodeFunctionData({
        abi: stakingABI,
        functionName: 'stake',
        args: [amount],
      });

      // Send stake transaction
      const stakeTxHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: userAddress,
            to: TETHRA_STAKING,
            data: stakeData,
          },
        ],
      });

      // Wait for staking to be confirmed
      await publicClient!.waitForTransactionReceipt({ hash: stakeTxHash });

      // Refresh all contract data immediately after successful staking
      await fetchContractData();

      setStakeAmount('');
      alert('Staking successful! Data refreshed.');
    } catch (error) {
      console.error('Transaction failed:', error);
      alert('Transaction failed: ' + (error as any).message);
    } finally {
      setIsTransacting(false);
    }
  };

  const handleConnect = () => {
    login();
  };

  if (!ready) {
    return (
      <div className={`bg-slate-900/50 rounded-lg border border-slate-800 p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-48 mb-6"></div>
          <div className="h-32 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-slate-900/50 rounded-lg border border-slate-800 p-6 ${className}`}>
      <div className="flex items-center gap-2 mb-6">
        <Coins className="text-blue-400" size={24} />
        <h2 className="text-xl font-bold text-white">TETH Staking</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-green-400" />
            <span className="text-sm text-gray-400">Current APR</span>
          </div>
          <p className="text-lg font-semibold text-white">{poolData.stakingAPR || '...'}</p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Coins size={16} className="text-blue-400" />
            <span className="text-sm text-gray-400">Total Staked</span>
          </div>
          <p className="text-lg font-semibold text-white">
            {isLoading ? '...' : `${Number(formatUnits(totalStaked, 18)).toFixed(2)} TETH`}
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

      <div className="bg-slate-800/30 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white">Your Staking</h3>
          <button
            onClick={() => fetchContractData()}
            className="text-blue-400 hover:text-blue-300 text-sm"
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-400">Staked Amount</p>
            <p className="font-semibold text-white">
              {isLoading ? '...' : `${Number(formatUnits(userStakedAmount, 18)).toFixed(2)} TETH`}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Pending Rewards</p>
            <p className="font-semibold text-green-400">
              {isLoading ? '...' : `${Number(formatUnits(pendingRewards, 6)).toFixed(2)} USDC`}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Available Balance</p>
            <p className="font-semibold text-white">
              {isLoading ? '...' : `${Number(formatUnits(userBalance, 18)).toFixed(2)} TETH`}
            </p>
          </div>
        </div>
      </div>

      {authenticated && userAddress ? (
        <>
          <div className="bg-slate-800/30 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-white mb-3">Your Wallet</h3>
            <div className="text-sm text-gray-400">
              <p>
                Connected: {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
              </p>
              <p className="mt-1">Ready for staking transactions</p>
            </div>
          </div>

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
                  onClick={() => setStakeAmount(Number(formatUnits(userBalance, 18)).toFixed(2))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 text-sm hover:text-blue-300"
                >
                  MAX
                </button>
              </div>
            </div>

            <button
              onClick={handleApproveAndStake}
              disabled={!stakeAmount || Number(stakeAmount) <= 0 || isTransacting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
            >
              {isTransacting
                ? 'Processing...'
                : allowance >= parseUnits(stakeAmount || '0', 18)
                ? 'Stake TETH'
                : 'Approve & Stake TETH'}
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">
            {authenticated
              ? 'Connect an external wallet (MetaMask, etc.) to stake TETH'
              : 'Connect your wallet to start staking TETH'}
          </p>
          <button
            onClick={handleConnect}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            {authenticated ? 'Connect External Wallet' : 'Connect Wallet'}
          </button>
        </div>
      )}
    </div>
  );
}
