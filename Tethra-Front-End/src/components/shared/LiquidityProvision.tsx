'use client';

import React, { useMemo, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Droplets, TrendingUp, Clock } from 'lucide-react';
import { USDC_ADDRESS, VAULT_POOL_ADDRESS } from '@/config/contracts';

const VAULT_SHARE_DECIMALS = 18;

const usdcABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
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
] as const;

const vaultPoolABI = [
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
    name: 'convertToShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
    name: 'deposit',
    outputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'withdraw',
    outputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
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

interface LiquidityProvisionProps {
  className?: string;
}

export default function LiquidityProvision({ className = '' }: LiquidityProvisionProps) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const { data: vaultAssets } = useReadContract({
    address: VAULT_POOL_ADDRESS,
    abi: vaultPoolABI,
    functionName: 'totalAssets',
    query: { enabled: !!publicClient },
  });

  const { data: vaultSharesSupply } = useReadContract({
    address: VAULT_POOL_ADDRESS,
    abi: vaultPoolABI,
    functionName: 'totalSupply',
    query: { enabled: !!publicClient },
  });

  const { data: userShares } = useReadContract({
    address: VAULT_POOL_ADDRESS,
    abi: vaultPoolABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isConnected },
  });

  const { data: userUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: usdcABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isConnected },
  });

  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: usdcABI,
    functionName: 'allowance',
    args: address ? [address, VAULT_POOL_ADDRESS] : undefined,
    query: { enabled: isConnected && mode === 'deposit' },
  });

  const { writeContractAsync } = useWriteContract();
  const { isLoading: isTxPending } = useWaitForTransactionReceipt({ hash: txHash });

  const needsApproval = useMemo(() => {
    if (!allowance || !amount) return false;
    const amt = parseUnits(amount || '0', 6);
    return allowance < amt;
  }, [allowance, amount]);

  const formattedVaultAssets = vaultAssets
    ? Number(formatUnits(vaultAssets as bigint, 6)).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00';
  const formattedUserUsdc = userUsdc
    ? Number(formatUnits(userUsdc as bigint, 6)).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00';
  const formattedUserShares = userShares
    ? Number(formatUnits(userShares as bigint, VAULT_SHARE_DECIMALS)).toLocaleString('en-US', {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      })
    : '0.000000';

  const minDepositForOneShareUnit = useMemo(() => {
    if (!vaultAssets || !vaultSharesSupply || vaultSharesSupply === 0n) return null;
    // smallest share unit costs (totalAssets / totalSupply); round up to avoid zero-share revert
    return (
      ((vaultAssets as bigint) + (vaultSharesSupply as bigint) - 1n) / (vaultSharesSupply as bigint)
    );
  }, [vaultAssets, vaultSharesSupply]);

  const handleSubmit = async () => {
    if (!amount || !isConnected) return;
    const amt = parseUnits(amount, 6);

    if (mode === 'deposit') {
      const previewShares = await publicClient?.readContract({
        address: VAULT_POOL_ADDRESS,
        abi: vaultPoolABI,
        functionName: 'convertToShares',
        args: [amt],
      });

      if (!previewShares || previewShares === 0n) {
        setError('Amount too small for current vault price. Try a slightly larger deposit.');
        return;
      }

      setError(null);

      if (needsApproval) {
        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: usdcABI,
          functionName: 'approve',
          args: [VAULT_POOL_ADDRESS, amt],
        });
        setTxHash(approveHash);
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });
      }

      const hash = await writeContractAsync({
        address: VAULT_POOL_ADDRESS,
        abi: vaultPoolABI,
        functionName: 'deposit',
        args: [amt],
      });
      setTxHash(hash);
    } else {
      // withdraw expects shares; convert assets to shares first
      const shares = await publicClient?.readContract({
        address: VAULT_POOL_ADDRESS,
        abi: vaultPoolABI,
        functionName: 'convertToShares',
        args: [amt],
      });
      const sharesToWithdraw = (shares as bigint) || 0n;
      const hash = await writeContractAsync({
        address: VAULT_POOL_ADDRESS,
        abi: vaultPoolABI,
        functionName: 'withdraw',
        args: [sharesToWithdraw],
      });
      setTxHash(hash);
    }
  };

  return (
    <div className={`bg-slate-900/50 rounded-lg border border-slate-800 p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <Droplets className="text-blue-400" size={20} />
        <h3 className="text-lg font-semibold text-white">Vault Pool Liquidity</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <MetricCard
          label="Vault TVL"
          value={`$${formattedVaultAssets}`}
          icon={<TrendingUp className="text-green-400" size={18} />}
        />
        <MetricCard
          label="Your USDC"
          value={`${formattedUserUsdc} USDC`}
          icon={<Clock className="text-blue-400" size={18} />}
        />
        <MetricCard
          label="Your Vault Shares"
          value={`${formattedUserShares} vUSDC`}
          icon={<Droplets className="text-purple-400" size={18} />}
        />
      </div>

      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1">
          <label className="block text-sm text-gray-400 mb-2">Amount (USDC)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
            placeholder="0.00"
            min="0"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMode('deposit')}
            className={`px-4 py-2 rounded-lg border ${
              mode === 'deposit'
                ? 'border-blue-500 text-blue-200'
                : 'border-slate-700 text-gray-300'
            } bg-slate-800`}
          >
            Deposit
          </button>
          <button
            onClick={() => setMode('withdraw')}
            className={`px-4 py-2 rounded-lg border ${
              mode === 'withdraw'
                ? 'border-blue-500 text-blue-200'
                : 'border-slate-700 text-gray-300'
            } bg-slate-800`}
          >
            Withdraw
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!isConnected || !amount || isTxPending}
          className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {isTxPending
            ? 'Pending...'
            : mode === 'deposit'
            ? needsApproval
              ? 'Approve & Deposit'
              : 'Deposit'
            : 'Withdraw'}
        </button>
      </div>

      {mode === 'deposit' && minDepositForOneShareUnit && (
        <p className="text-xs text-gray-400 mt-2">
          Current min deposit to mint 1 share unit: ~
          {Number(formatUnits(minDepositForOneShareUnit, 6)).toFixed(6)} USDC
        </p>
      )}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      {!isConnected && (
        <p className="text-xs text-yellow-400 mt-3">
          Connect your wallet to interact with the vault.
        </p>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-400">{label}</p>
        <p className="text-lg font-semibold text-white">{value}</p>
      </div>
      <div>{icon}</div>
    </div>
  );
}
