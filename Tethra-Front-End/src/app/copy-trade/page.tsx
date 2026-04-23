'use client';

import { Star, TrendingUp, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import PageLayout from '@/components/layout/PageLayout';

// Mock data untuk traders
const mockTraders = [
  {
    id: 1,
    name: 'BLUE_TR',
    amount: '$344,506',
    badge: 'API',
    pnl7D: '+$459.26',
    pnl30D: '+$1,250.50',
    pnl90D: '+$3,800.75',
    roi: '+2.81%',
    mdd: '11.99%',
    aum: '806,451.98',
    copyTraders: 90200,
    copyTraderPnl: '11,003.90',
    sharpeRatio: '13.47',
    mdd7D: '13.18%',
    chartData: [30, 35, 38, 42, 45, 48, 52, 50, 54, 58],
  },
  {
    id: 2,
    name: 'ToRiches',
    amount: '$90,200',
    badge: null,
    pnl7D: '+$48.31',
    pnl30D: '+$180.45',
    pnl90D: '+$520.80',
    roi: '+1.61%',
    mdd: '5.88%',
    aum: '11,003.90',
    copyTraders: 90200,
    copyTraderPnl: '13.18%',
    sharpeRatio: '9.69',
    mdd7D: '13.18%',
    chartData: [25, 28, 32, 35, 38, 40, 43, 45, 47, 50],
  },
  {
    id: 3,
    name: 'KotTradingClub',
    amount: '$334,506',
    badge: 'API',
    pnl7D: '+$1.95',
    pnl30D: '+$8.50',
    pnl90D: '+$25.30',
    roi: '+0.02%',
    mdd: '5.88%',
    aum: '277,549.04',
    copyTraders: 90200,
    copyTraderPnl: '5.88%',
    sharpeRatio: '9.43',
    mdd7D: '13.18%',
    chartData: [40, 38, 42, 44, 43, 45, 47, 46, 48, 49],
  },
  {
    id: 4,
    name: 'CryptoKing',
    amount: '$520,800',
    badge: 'API',
    pnl7D: '+$680.50',
    pnl30D: '+$2,450.20',
    pnl90D: '+$7,200.90',
    roi: '+3.45%',
    mdd: '8.75%',
    aum: '520,800.50',
    copyTraders: 75000,
    copyTraderPnl: '8,500.40',
    sharpeRatio: '15.20',
    mdd7D: '10.50%',
    chartData: [35, 40, 38, 45, 50, 48, 55, 53, 58, 60],
  },
  {
    id: 5,
    name: 'MoonTrader',
    amount: '$180,400',
    badge: null,
    pnl7D: '+$125.80',
    pnl30D: '+$480.60',
    pnl90D: '+$1,350.40',
    roi: '+2.15%',
    mdd: '6.50%',
    aum: '180,400.20',
    copyTraders: 45000,
    copyTraderPnl: '5,200.30',
    sharpeRatio: '11.80',
    mdd7D: '8.20%',
    chartData: [28, 32, 35, 38, 40, 42, 45, 43, 47, 50],
  },
  {
    id: 6,
    name: 'WhalePro',
    amount: '$890,200',
    badge: 'API',
    pnl7D: '+$920.40',
    pnl30D: '+$3,500.80',
    pnl90D: '+$10,200.50',
    roi: '+4.20%',
    mdd: '9.30%',
    aum: '890,200.75',
    copyTraders: 120000,
    copyTraderPnl: '15,800.60',
    sharpeRatio: '16.50',
    mdd7D: '12.40%',
    chartData: [42, 45, 48, 50, 52, 55, 58, 56, 60, 62],
  },
];

export default function CopyTradePage() {
  const [activeTab, setActiveTab] = useState<'portfolio' | 'favorites'>('portfolio');
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<'7D' | '30D' | '90D'>('7D');
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Get PnL based on selected time filter
  const getPnL = (trader: any) => {
    switch (selectedTimeFilter) {
      case '7D':
        return trader.pnl7D;
      case '30D':
        return trader.pnl30D;
      case '90D':
        return trader.pnl90D;
      default:
        return trader.pnl7D;
    }
  };

  // Sort traders based on selected metric
  const getSortedTraders = () => {
    const sorted = [...mockTraders];

    if (selectedMetric) {
      sorted.sort((a: any, b: any) => {
        let aVal, bVal;

        switch (selectedMetric) {
          case 'PnL':
            aVal = parseFloat(getPnL(a).replace(/[\$,+]/g, ''));
            bVal = parseFloat(getPnL(b).replace(/[\$,+]/g, ''));
            break;
          case 'ROI':
            aVal = parseFloat(a.roi.replace(/[%+]/g, ''));
            bVal = parseFloat(b.roi.replace(/[%+]/g, ''));
            break;
          case 'MDD':
            aVal = parseFloat(a.mdd.replace(/[%]/g, ''));
            bVal = parseFloat(b.mdd.replace(/[%]/g, ''));
            break;
          case 'AUM':
            aVal = parseFloat(a.aum.replace(/[,]/g, ''));
            bVal = parseFloat(b.aum.replace(/[,]/g, ''));
            break;
          case 'Copy Traders':
            aVal = a.copyTraders;
            bVal = b.copyTraders;
            break;
          case 'Copy Trader PnL':
            aVal = parseFloat(a.copyTraderPnl.replace(/[,]/g, ''));
            bVal = parseFloat(b.copyTraderPnl.replace(/[,]/g, ''));
            break;
          case 'Sharpe Ratio':
            aVal = parseFloat(a.sharpeRatio);
            bVal = parseFloat(b.sharpeRatio);
            break;
          default:
            return 0;
        }

        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    return sorted;
  };

  const filteredTraders = getSortedTraders();

  return (
    <PageLayout
      navbar={{
        title: 'Copy Trade',
        subtitle: "Follow the world's top crypto traders",
        variant: 'transparent',
      }}
      contentClassName="!p-0"
    >
      <div className="h-full overflow-auto bg-[#0a0e14] rounded-lg copy-trade-scrollbar">
        <div className="p-6 space-y-6">
          {/* Banner and Growth Plan Card */}
          <div className="flex gap-4 flex-col lg:flex-row">
            {/* Banner */}
            <div className="flex-1 bg-[#151B26] rounded-lg p-6 flex items-center justify-between border border-[#1e2735] hover:border-[#2a3441] transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
                  <TrendingUp size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-white font-medium text-sm">
                    Tethra Futures Copy Trading Lead Trader Growth Plan
                  </h3>
                </div>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-[#1e2735] rounded-lg text-sm border border-[#2a3441] transition-all">
                <span>Watch Tutorial</span>
              </button>
            </div>

            {/* Growth Plan Card */}
            <div className="lg:w-[380px] bg-[#151B26] rounded-lg p-6 border border-[#1e2735]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-white font-medium text-base mb-1">
                    Copy Trading Lead Trader
                  </h3>
                  <p className="text-white font-semibold text-lg">Growth Plan</p>
                </div>
                <div className="flex flex-col items-end">
                  <div className="relative w-16 h-20">
                    <div className="absolute bottom-0 w-3 h-8 bg-blue-500 rounded-sm left-0"></div>
                    <div className="absolute bottom-0 w-3 h-12 bg-blue-500 rounded-sm left-4"></div>
                    <div className="absolute bottom-0 w-3 h-16 bg-blue-500 rounded-sm left-8"></div>
                    <div className="absolute bottom-0 w-3 h-20 bg-blue-500 rounded-sm left-12"></div>
                    <TrendingUp className="absolute -top-1 right-0 text-blue-500" size={20} />
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-[#1e2735]">
            <div className="flex gap-8">
              <button
                onClick={() => setActiveTab('portfolio')}
                className={`pb-3 relative transition-colors cursor-pointer ${
                  activeTab === 'portfolio' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className="font-medium">Portfolio List</span>
                {activeTab === 'portfolio' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab('favorites')}
                className={`pb-3 relative transition-colors cursor-pointer ${
                  activeTab === 'favorites' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className="font-medium">My Favorites</span>
                {activeTab === 'favorites' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
                )}
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 bg-[#151B26] rounded-lg px-4 py-2 border border-[#1e2735]">
                {/* Time Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowTimeDropdown(!showTimeDropdown)}
                    className="px-3 py-1 rounded transition-colors cursor-pointer bg-[#2a3441] text-white flex items-center gap-2"
                  >
                    <span>{selectedTimeFilter}</span>
                    <svg
                      className={`w-4 h-4 transition-transform ${
                        showTimeDropdown ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {showTimeDropdown && (
                    <div className="absolute top-full left-0 mt-2 bg-[#1e2735] rounded-lg border border-[#2a3441] shadow-lg z-10 min-w-[80px]">
                      <button
                        onClick={() => {
                          setSelectedTimeFilter('7D');
                          setShowTimeDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-sm text-left hover:bg-[#2a3441] transition-colors cursor-pointer rounded-t-lg"
                      >
                        7D
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTimeFilter('30D');
                          setShowTimeDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-sm text-left hover:bg-[#2a3441] transition-colors cursor-pointer"
                      >
                        30D
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTimeFilter('90D');
                          setShowTimeDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-sm text-left hover:bg-[#2a3441] transition-colors cursor-pointer rounded-b-lg"
                      >
                        90D
                      </button>
                    </div>
                  )}
                </div>

                <span className="text-gray-600">|</span>

                {/* Category 1: PnL, ROI, MDD, AUM */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (selectedMetric === 'PnL') {
                        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSelectedMetric('PnL');
                        setSortOrder('desc');
                      }
                    }}
                    className={`px-3 py-1 text-sm rounded transition-colors cursor-pointer ${
                      selectedMetric === 'PnL'
                        ? 'bg-[#2a3441] text-white'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    PnL
                  </button>
                  <button
                    onClick={() => {
                      if (selectedMetric === 'ROI') {
                        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSelectedMetric('ROI');
                        setSortOrder('desc');
                      }
                    }}
                    className={`px-3 py-1 text-sm rounded transition-colors cursor-pointer ${
                      selectedMetric === 'ROI'
                        ? 'bg-[#2a3441] text-white'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    ROI
                  </button>
                  <button
                    onClick={() => {
                      if (selectedMetric === 'MDD') {
                        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSelectedMetric('MDD');
                        setSortOrder('desc');
                      }
                    }}
                    className={`px-3 py-1 text-sm rounded transition-colors cursor-pointer hidden lg:block ${
                      selectedMetric === 'MDD'
                        ? 'bg-[#2a3441] text-white'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    MDD
                  </button>
                  <button
                    onClick={() => {
                      if (selectedMetric === 'AUM') {
                        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSelectedMetric('AUM');
                        setSortOrder('desc');
                      }
                    }}
                    className={`px-3 py-1 text-sm rounded transition-colors cursor-pointer hidden lg:block ${
                      selectedMetric === 'AUM'
                        ? 'bg-[#2a3441] text-white'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    AUM
                  </button>
                </div>

                <span className="text-gray-600 lg:block hidden">|</span>

                {/* Category 2: Copy Traders, Copy Trader PnL */}
                <div className="lg:flex hidden items-center gap-3">
                  <button
                    onClick={() => {
                      if (selectedMetric === 'Copy Traders') {
                        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSelectedMetric('Copy Traders');
                        setSortOrder('desc');
                      }
                    }}
                    className={`px-3 py-1 text-sm rounded transition-colors cursor-pointer ${
                      selectedMetric === 'Copy Traders'
                        ? 'bg-[#2a3441] text-white'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Copy Traders
                  </button>
                  <button
                    onClick={() => {
                      if (selectedMetric === 'Copy Trader PnL') {
                        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSelectedMetric('Copy Trader PnL');
                        setSortOrder('desc');
                      }
                    }}
                    className={`px-3 py-1 text-sm rounded transition-colors cursor-pointer ${
                      selectedMetric === 'Copy Trader PnL'
                        ? 'bg-[#2a3441] text-white'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Copy Trader PnL
                  </button>
                </div>

                <span className="text-gray-600">|</span>

                {/* Category 3: Sharpe Ratio */}
                <button
                  onClick={() => {
                    if (selectedMetric === 'Sharpe Ratio') {
                      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                    } else {
                      setSelectedMetric('Sharpe Ratio');
                      setSortOrder('desc');
                    }
                  }}
                  className={`px-3 py-1 text-sm rounded transition-colors cursor-pointer hidden lg:block ${
                    selectedMetric === 'Sharpe Ratio'
                      ? 'bg-[#2a3441] text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Sharpe Ratio
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-[#1e2735] rounded-lg transition-colors">
                <Search size={20} className="text-gray-500 hover:text-gray-300" />
              </button>
              <button className="p-2 hover:bg-[#1e2735] rounded-lg transition-colors">
                <SlidersHorizontal size={20} className="text-gray-500 hover:text-gray-300" />
              </button>
            </div>
          </div>

          {/* Trader Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTraders.map((trader) => (
              <div
                key={trader.id}
                className="bg-[#151B26] rounded-lg p-5 border border-[#1e2735] hover:border-[#2a3441] transition-all cursor-pointer"
              >
                {/* Trader Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#1e2735] rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-400">
                        {trader.name.substring(0, 2)}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{trader.name}</h3>
                        {trader.badge && (
                          <span className="text-xs px-2 py-0.5 bg-[#1e2735] rounded text-gray-400">
                            {trader.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-sm">{trader.amount}</p>
                    </div>
                  </div>
                  <button className="text-gray-600 hover:text-blue-500 transition-colors">
                    <Star size={20} />
                  </button>
                </div>

                {/* PnL Section */}
                <div className="mb-4">
                  <div className="text-gray-500 text-xs mb-1">{selectedTimeFilter} PNL</div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-green-400">{getPnL(trader)}</span>
                  </div>
                  <div className="text-sm text-green-400 mt-1">ROI {trader.roi}</div>
                </div>

                {/* Line Chart */}
                <div className="mb-4 h-16 relative">
                  <svg className="w-full h-full" viewBox="0 0 200 60" preserveAspectRatio="none">
                    {/* Create path for line chart */}
                    <path
                      d={trader.chartData
                        .map((value, idx) => {
                          const x = (idx / (trader.chartData.length - 1)) * 200;
                          const y = 60 - (value / 60) * 60;
                          return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                  <div>
                    <div className="text-gray-500">AUM</div>
                    <div className="text-white font-medium">{trader.aum}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">7D MDD</div>
                    <div className="text-white font-medium">{trader.mdd}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Sharpe Ratio</div>
                    <div className="text-white font-medium">{trader.sharpeRatio}</div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button className="flex-1 py-2 bg-[#0a0e14] hover:bg-[#1e2735] text-white rounded-lg text-sm font-medium border border-[#1e2735] transition-all cursor-pointer">
                    Mock
                  </button>
                  <button className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-all cursor-pointer">
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
