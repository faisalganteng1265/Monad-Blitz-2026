'use client';

import React from 'react';
import PageLayout from '@/components/layout/PageLayout';
import usePoolData from '@/hooks/data/usePoolData';
import LiquidityProvision from '@/components/shared/LiquidityProvision';

export default function PoolsPage() {
  const poolData = usePoolData();

  return (
    <PageLayout
      navbar={{
        title: poolData.isLoading ? 'Loading...' : poolData.totalTVL,
        subtitle: 'TVL in vaults and pools',
      }}
      mobileHeaderContent={
        <div>
          <h1 className="text-3xl font-bold mb-2">
            {poolData.isLoading ? (
              <div className="animate-pulse bg-gray-700 h-8 w-48 rounded"></div>
            ) : (
              poolData.totalTVL
            )}
          </h1>
          <p className="text-gray-400 text-sm">TVL in vaults and pools.</p>
          {poolData.error && <p className="text-red-400 text-xs mt-1">Error: {poolData.error}</p>}
        </div>
      }
    >
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">
          {poolData.isLoading ? (
            <div className="animate-pulse bg-gray-700 h-10 w-64 rounded"></div>
          ) : (
            poolData.totalTVL
          )}
        </h1>
        <p className="text-gray-400 text-sm">TVL in vaults and pools.</p>
        {poolData.error && <p className="text-red-400 text-xs mt-1">Error: {poolData.error}</p>}

        {/* Time period tabs */}
        <div className="flex gap-2 mt-4">
          {['Last 30d', 'Last 90d', 'Last 180d', 'Total'].map((period) => (
            <button
              key={period}
              className={`px-4 py-2 rounded-lg text-sm ${
                period === 'Last 90d'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-900 text-gray-400 hover:bg-slate-800'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* USDC Liquidity Mining Section */}
      <div className="mb-8">
        <LiquidityProvision />
      </div>

      {/* Tetra Liquidity Pools (Mockup) */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Tethra Liquidity Pools</h2>
        <p className="text-gray-400 text-sm mb-4">
          Provide dual-asset liquidity to earn trading fees + TETH rewards. Protected against
          impermanent loss with Pyth Oracle pricing.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* WETH/USDC Pool */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex -space-x-2">
                <img
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png"
                  alt="ETH"
                  className="w-8 h-8 rounded-full border-2 border-slate-700"
                />
                <div className="w-8 h-8 rounded-full border-2 border-slate-700 bg-green-500 flex items-center justify-center text-xs font-bold text-white">
                  $
                </div>
              </div>
              <div>
                <h3 className="font-bold text-white">WETH/USDC</h3>
                <p className="text-xs text-gray-400">Major pair, deep liquidity</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-400">TVL</p>
                <p className="font-semibold text-white">$2.4M</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">APR</p>
                <p className="font-semibold text-green-400">28.5%</p>
              </div>
            </div>
            <button className="w-full bg-slate-700 hover:bg-slate-600 text-gray-300 py-2 rounded-lg text-sm transition-colors">
              Coming Soon
            </button>
          </div>

          {/* BTC/USDC Pool */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex -space-x-2">
                <img
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png"
                  alt="BTC"
                  className="w-8 h-8 rounded-full border-2 border-slate-700"
                />
                <div className="w-8 h-8 rounded-full border-2 border-slate-700 bg-green-500 flex items-center justify-center text-xs font-bold text-white">
                  $
                </div>
              </div>
              <div>
                <h3 className="font-bold text-white">BTC/USDC</h3>
                <p className="text-xs text-gray-400">Bitcoin trading pair</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-400">TVL</p>
                <p className="font-semibold text-white">$1.8M</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">APR</p>
                <p className="font-semibold text-green-400">31.2%</p>
              </div>
            </div>
            <button className="w-full bg-slate-700 hover:bg-slate-600 text-gray-300 py-2 rounded-lg text-sm transition-colors">
              Coming Soon
            </button>
          </div>

          {/* LINK/USDC Pool */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex -space-x-2">
                <img
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png"
                  alt="LINK"
                  className="w-8 h-8 rounded-full border-2 border-slate-700"
                />
                <div className="w-8 h-8 rounded-full border-2 border-slate-700 bg-green-500 flex items-center justify-center text-xs font-bold text-white">
                  $
                </div>
              </div>
              <div>
                <h3 className="font-bold text-white">LINK/USDC</h3>
                <p className="text-xs text-gray-400">Chainlink oracle token</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-400">TVL</p>
                <p className="font-semibold text-white">$890K</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">APR</p>
                <p className="font-semibold text-green-400">42.8%</p>
              </div>
            </div>
            <button className="w-full bg-slate-700 hover:bg-slate-600 text-gray-300 py-2 rounded-lg text-sm transition-colors">
              Coming Soon
            </button>
          </div>

          {/* SOL/USDC Pool */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex -space-x-2">
                <img
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png"
                  alt="SOL"
                  className="w-8 h-8 rounded-full border-2 border-slate-700"
                />
                <div className="w-8 h-8 rounded-full border-2 border-slate-700 bg-green-500 flex items-center justify-center text-xs font-bold text-white">
                  $
                </div>
              </div>
              <div>
                <h3 className="font-bold text-white">SOL/USDC</h3>
                <p className="text-xs text-gray-400">Solana ecosystem token</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-400">TVL</p>
                <p className="font-semibold text-white">$620K</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">APR</p>
                <p className="font-semibold text-green-400">38.7%</p>
              </div>
            </div>
            <button className="w-full bg-slate-700 hover:bg-slate-600 text-gray-300 py-2 rounded-lg text-sm transition-colors">
              Coming Soon
            </button>
          </div>
        </div>

        {/* Tethra Vaults Preview */}
        <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-lg border border-blue-500/30 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">GLV</span>
            </div>
            <div>
              <h3 className="font-bold text-white">Tethra Multi-Strategy Vaults</h3>
              <p className="text-xs text-gray-400">
                Auto-diversified yield across multiple Tethra pools
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-400">Target TVL</p>
              <p className="font-semibold text-white">$10M+</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Expected APR</p>
              <p className="font-semibold text-green-400">25-35%</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Strategy</p>
              <p className="font-semibold text-blue-400">Auto-compound</p>
            </div>
          </div>
          <p className="text-sm text-gray-300 mb-4">
            Deposit USDC once, earn diversified yield from WETH/USDC, BTC/USDC, LINK/USDC, and
            SOL/USDC pools. Automatic rebalancing and compounding powered by Pyth Oracle prices.
          </p>
          <button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-2 rounded-lg text-sm transition-all">
            Notify Me When Available
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
