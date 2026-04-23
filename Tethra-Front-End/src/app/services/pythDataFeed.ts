export interface Candle {
  time: number; // timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class PythDataFeed {
  private baseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001') + '/api'; // Your backend URL
  private wsUrl =
    (process.env.NEXT_PUBLIC_BACKEND_URL || 'ws://localhost:3001').replace(/^http/, 'ws') + '/ws'; // WebSocket URL

  /**
   * Convert timeframe to backend interval format
   * TradingView: '1', '5', '15', '30', '60', '240', 'D', 'W', 'M'
   * Backend: '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'
   */
  private convertTimeframe(timeframe: string): string {
    const timeframeMap: Record<string, string> = {
      '1': '1m',
      '3': '3m',
      '5': '5m',
      '15': '15m',
      '30': '30m',
      '60': '1h',
      '120': '2h',
      '240': '4h',
      '360': '6h',
      '480': '8h',
      '720': '12h',
      D: '1d',
      W: '1w',
      M: '1M',
    };
    return timeframeMap[timeframe] || '1h';
  }

  /**
   * Convert symbol format (BTCUSDT -> BTC)
   */
  private convertSymbol(symbol: string): string {
    // Remove USDT suffix to get clean symbol (BTC, ETH, SOL, etc.)
    return symbol.replace('USDT', '');
  }

  /**
   * Fetch historical candlestick data from Pyth Oracle backend with Binance fallback
   */
  async fetchCandles(symbol: string, timeframe: string, limit: number = 500): Promise<Candle[]> {
    const interval = this.convertTimeframe(timeframe);
    const cleanSymbol = this.convertSymbol(symbol);
    const url = `${this.baseUrl}/candles/${cleanSymbol}?interval=${interval}&limit=${limit}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Backend should return array of candles with format:
      // { time: number, open: number, high: number, low: number, close: number, volume: number }
      if (!Array.isArray(data)) {
        throw new Error('Invalid response format - expected array');
      }

      if (data.length === 0) {
        throw new Error('No candles returned');
      }

      return data.map((candle: any) => ({
        time: candle.time || candle.timestamp,
        open: parseFloat(candle.open),
        high: parseFloat(candle.high),
        low: parseFloat(candle.low),
        close: parseFloat(candle.close),
        volume: parseFloat(candle.volume || 0),
      }));
    } catch (error) {
      if (error instanceof Error) {
      } else {
      }

      // Fallback to Binance API
      try {
        const interval = this.convertTimeframe(timeframe);
        const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

        const response = await fetch(binanceUrl);
        if (!response.ok) {
          throw new Error(`Binance fallback failed: ${response.statusText}`);
        }

        const data = await response.json();

        // Binance returns: [timestamp, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore]
        return data.map((candle: any[]) => ({
          time: candle[0],
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5]),
        }));
      } catch (binanceError) {
        return [];
      }
    }
  }

  /**
   * Format candles for TradingVue (OHLCV format)
   * TradingVue expects: [timestamp, open, high, low, close, volume]
   */
  formatForTradingVue(candles: Candle[]): number[][] {
    return candles.map((candle) => [
      candle.time,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ]);
  }

  /**
   * Create WebSocket connection for real-time updates from Pyth Oracle with Binance fallback
   */
  createWebSocket(
    symbol: string,
    timeframe: string,
    onCandle: (candle: Candle) => void,
  ): { ws: WebSocket; cleanup: () => void } {
    const interval = this.convertTimeframe(timeframe);
    const cleanSymbol = this.convertSymbol(symbol);

    let ws: WebSocket;
    let pingInterval: NodeJS.Timeout | null = null;
    let usePyth = true;

    try {
      // Try Pyth Oracle WebSocket first
      ws = new WebSocket(`${this.wsUrl}/candles`);

      // Set timeout to fallback to Binance if Pyth doesn't connect
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
        }
      }, 5000); // 5 second timeout

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        usePyth = true;

        // Subscribe to specific symbol and interval
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            symbol: cleanSymbol,
            interval: interval,
          }),
        );

        // Start ping interval when connection is established
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 180000); // 3 minutes
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'candle_update' && data.candle) {
            const candle: Candle = {
              time: data.candle.time || data.candle.timestamp,
              open: parseFloat(data.candle.open),
              high: parseFloat(data.candle.high),
              low: parseFloat(data.candle.low),
              close: parseFloat(data.candle.close),
              volume: parseFloat(data.candle.volume || 0),
            };
            onCandle(candle);
          }
        } catch (error) {}
      };

      ws.onerror = () => {
        usePyth = false;
      };

      ws.onclose = () => {
        clearTimeout(connectionTimeout);

        // If Pyth failed, fallback to Binance
        if (!usePyth) {
          const stream = `${symbol.toLowerCase()}@kline_${interval}`;
          ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);

          ws.onopen = () => {
            pingInterval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ method: 'ping' }));
              }
            }, 180000);
          };

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              const kline = data.k;

              if (kline) {
                const candle: Candle = {
                  time: kline.t,
                  open: parseFloat(kline.o),
                  high: parseFloat(kline.h),
                  low: parseFloat(kline.l),
                  close: parseFloat(kline.c),
                  volume: parseFloat(kline.v),
                };
                onCandle(candle);
              }
            } catch (error) {}
          };

          ws.onerror = (error) => {};

          ws.onclose = () => {
            if (pingInterval) {
              clearInterval(pingInterval);
              pingInterval = null;
            }
          };
        }

        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
      };
    } catch (error) {
      // Direct Binance fallback
      const stream = `${symbol.toLowerCase()}@kline_${interval}`;
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);

      ws.onopen = () => {
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'ping' }));
          }
        }, 180000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const kline = data.k;

          if (kline) {
            const candle: Candle = {
              time: kline.t,
              open: parseFloat(kline.o),
              high: parseFloat(kline.h),
              low: parseFloat(kline.l),
              close: parseFloat(kline.c),
              volume: parseFloat(kline.v),
            };
            onCandle(candle);
          }
        } catch (error) {}
      };
    }

    // Return cleanup function
    const cleanup = () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        if (ws.readyState === WebSocket.OPEN && usePyth) {
          try {
            ws.send(
              JSON.stringify({
                type: 'unsubscribe',
                symbol: cleanSymbol,
                interval: interval,
              }),
            );
          } catch (e) {
            // Ignore errors during cleanup
          }
        }
        ws.close();
      }
    };

    return { ws: ws!, cleanup };
  }
}

export const pythDataFeed = new PythDataFeed();
