'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useMarket } from '@/features/trading/contexts/MarketContext';
import { ALL_MARKETS } from '@/features/trading/constants/markets';

interface TickerData {
  symbol: string;
  binanceSymbol: string;
  price: number;
  change: number;
  logoUrl?: string;
}

const PriceTicker: React.FC = () => {
  const { setActiveMarket } = useMarket();
  const [tickerData, setTickerData] = useState<TickerData[]>([]);
  const tickerMap = useRef<Map<string, TickerData>>(new Map());

  useEffect(() => {
    const binanceMarkets = ALL_MARKETS.filter((m) => m.binanceSymbol);
    if (binanceMarkets.length === 0) return;

    const symbols = binanceMarkets.map((m) => m.binanceSymbol).join(',');
    let ws: WebSocket | null = null;

    const connectWebSocket = () => {
      try {
        const streams = binanceMarkets
          .map((m) => `${m.binanceSymbol!.toLowerCase()}@ticker`)
          .join('/');

        ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.data) {
            const data = message.data;
            const symbol = data.s;
            const market = binanceMarkets.find((m) => m.binanceSymbol === symbol);

            if (market) {
              const newData = {
                symbol: market.symbol,
                binanceSymbol: symbol,
                price: parseFloat(data.c),
                change: parseFloat(data.P),
                logoUrl: market.logoUrl,
              };

              // Update ref immediately
              const currentMap = tickerMap.current;
              currentMap.set(symbol, newData);
            }
          }
        };

        ws.onerror = (error) => {};

        ws.onclose = () => {
          setTimeout(connectWebSocket, 3000);
        };
      } catch (error) {
        setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    // Update state from ref every 1 second to avoid excessive re-renders
    const intervalId = setInterval(() => {
      if (tickerMap.current.size > 0) {
        setTickerData(Array.from(tickerMap.current.values()));
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const handleMarketClick = (market: TickerData) => {
    const fullMarket = ALL_MARKETS.find((m) => m.symbol === market.symbol);
    if (fullMarket) {
      setActiveMarket({
        symbol: fullMarket.symbol,
        tradingViewSymbol: fullMarket.tradingViewSymbol,
        logoUrl: fullMarket.logoUrl,
        binanceSymbol: fullMarket.binanceSymbol,
        category: fullMarket.category,
        maxLeverage: fullMarket.maxLeverage,
      });
    }
  };

  // Duplicate data for seamless loop
  const duplicatedData = [...tickerData, ...tickerData];

  return (
    <div className="w-full bg-[#0a0a0a] border-t border-slate-800 overflow-hidden h-10 hidden lg:block">
      <div className="flex animate-scroll-left">
        {duplicatedData.map((item, index) => (
          <div
            key={`${item.binanceSymbol}-${index}`}
            onClick={() => handleMarketClick(item)}
            className="flex items-center gap-2 px-4 py-2 whitespace-nowrap cursor-pointer hover:bg-slate-800/50 transition-colors min-w-fit"
          >
            <img
              src={item.logoUrl || '/icons/usdc.png'}
              alt={item.symbol}
              className="w-5 h-5 rounded-full"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
              }}
            />
            <span className="text-white font-medium text-sm">{item.symbol}USDT</span>
            <span className="text-slate-300 font-mono text-sm">
              $
              {item.price.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: item.price < 1 ? 6 : 2,
              })}
            </span>
            <span
              className={`font-mono text-sm ${
                item.change >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {item.change >= 0 ? '+' : ''}
              {item.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes scroll-left {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .animate-scroll-left {
          animation: scroll-left 60s linear infinite;
        }

        .animate-scroll-left:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default PriceTicker;
