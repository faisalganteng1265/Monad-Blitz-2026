import { useEffect, useRef, useState } from 'react';
import { PricePoint } from '../types';
import { DISPLAY_DELAY_MS, INTERPOLATION_INTERVAL_MS } from '../constants';

export const usePriceHistory = (symbol: string, currentPrice: number) => {
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]); // Displayed history (delayed)
  const [rawPriceBuffer, setRawPriceBuffer] = useState<PricePoint[]>([]); // Raw data buffer (1.5 sec delay)
  const [interpolatedHistory, setInterpolatedHistory] = useState<PricePoint[]>([]); // For smooth interpolation
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to Pyth Oracle WebSocket for real-time price updates
  useEffect(() => {
    // Mapping symbol to Pyth price feed IDs
    const pythPriceIds: { [key: string]: string } = {
      BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
      ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
      SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
      AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
      NEAR: '0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750',
      BNB: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
      XRP: '0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8',
      // Add more as needed
    };

    const priceId = pythPriceIds[symbol];
    if (!priceId) {
      console.warn(`No Pyth price feed for ${symbol}`);
      return;
    }

    try {
      const ws = new WebSocket('wss://hermes.pyth.network/ws');

      ws.onopen = () => {
        // Subscribe to price feed
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            ids: [priceId],
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'price_update' && message.price_feed) {
            const priceFeed = message.price_feed;
            const priceData = priceFeed.price;

            const priceRaw = parseFloat(priceData.price);
            const expo = priceData.expo;
            const price = priceRaw * Math.pow(10, expo);
            const timestamp = Date.now();

            // Add to RAW BUFFER (not displayed immediately)
            setRawPriceBuffer((prev) => {
              const newBuffer = [...prev, { time: timestamp, price }];
              // Keep only last 5 minutes + delay buffer
              const cutoffTime = timestamp - 300000 - DISPLAY_DELAY_MS;
              return newBuffer.filter((p) => p.time >= cutoffTime);
            });
          }
        } catch (error) {
          console.error('Error parsing Pyth message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('Pyth WebSocket error:', error);
      };

      ws.onclose = () => {};

      wsRef.current = ws;

      return () => {
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      };
    } catch (error) {
      console.error('Failed to connect to Pyth WebSocket:', error);
    }
  }, [symbol]);

  // Add current price from props to buffer (fallback if WebSocket slow)
  useEffect(() => {
    if (currentPrice > 0) {
      setRawPriceBuffer((prev) => {
        const now = Date.now();
        // Only add if last update was more than 500ms ago (2 updates per second max)
        const lastUpdate = prev.length > 0 ? prev[prev.length - 1].time : 0;
        if (now - lastUpdate > 500) {
          const newBuffer = [...prev, { time: now, price: currentPrice }];
          const cutoffTime = now - 300000 - DISPLAY_DELAY_MS;
          return newBuffer.filter((p) => p.time >= cutoffTime);
        }
        return prev;
      });
    }
  }, [currentPrice]);

  // Process buffer with delay - move data from rawPriceBuffer to priceHistory
  // This ensures we always have "future" data for perfect interpolation!
  useEffect(() => {
    const processTimer = setInterval(() => {
      const now = Date.now();
      const displayTime = now - DISPLAY_DELAY_MS; // Show data from 1.5 seconds ago

      setRawPriceBuffer((currentBuffer) => {
        // Get all data that should be displayed now (older than delay)
        const readyData = currentBuffer.filter((p) => p.time <= displayTime);

        if (readyData.length > 0) {
          // Add ready data to display history
          setPriceHistory((prev) => {
            const combined = [...prev, ...readyData];
            // Remove duplicates based on time
            const unique = combined.filter(
              (item, index, self) => index === self.findIndex((t) => t.time === item.time),
            );
            // Sort by time and keep last 5 minutes
            const sorted = unique.sort((a, b) => a.time - b.time);
            const cutoffTime = now - 300000;
            return sorted.filter((p) => p.time >= cutoffTime);
          });
        }

        // Keep only future data in buffer
        return currentBuffer.filter((p) => p.time > displayTime);
      });
    }, 100); // Check every 100ms

    return () => clearInterval(processTimer);
  }, []);

  // Live interpolation - 60 FPS smooth animation with perfect buffer-based calculation
  // Each frame calculated from buffer = ZERO ambiguity, ZERO jumps!
  useEffect(() => {
    if (priceHistory.length < 1 && rawPriceBuffer.length < 1) {
      setInterpolatedHistory([]);
      return;
    }

    // Use requestAnimationFrame for smooth 60 FPS rendering
    let lastUpdateTime = Date.now();
    let animationId: number;

    const updateInterpolation = () => {
      const now = Date.now();
      const displayTime = now - DISPLAY_DELAY_MS; // 2 seconds behind real-time

      // Only update if enough time passed (16.67ms for 60 FPS)
      if (now - lastUpdateTime < INTERPOLATION_INTERVAL_MS) {
        animationId = requestAnimationFrame(updateInterpolation);
        return;
      }
      lastUpdateTime = now;

      // Combine ALL data (past + future buffer) for perfect interpolation
      const allData = [...priceHistory, ...rawPriceBuffer].sort((a, b) => a.time - b.time);

      // Remove duplicates
      const uniqueData = allData.filter(
        (item, index, self) => index === self.findIndex((t) => Math.abs(t.time - item.time) < 10),
      );

      if (uniqueData.length < 2) {
        if (uniqueData.length === 1) {
          setInterpolatedHistory(uniqueData);
        }
        animationId = requestAnimationFrame(updateInterpolation);
        return;
      }

      const interpolated: PricePoint[] = [];

      // Generate interpolated frames at EXACTLY 16.67ms intervals
      // Start from oldest data point
      const startTime = uniqueData[0].time;
      const endTime = displayTime;

      // Calculate all frames from start to current display time
      let currentFrameTime = startTime;

      while (currentFrameTime <= endTime) {
        // Find the two data points that bracket this frame time
        let beforePoint = uniqueData[0];
        let afterPoint = uniqueData[uniqueData.length - 1];

        for (let i = 0; i < uniqueData.length - 1; i++) {
          if (uniqueData[i].time <= currentFrameTime && uniqueData[i + 1].time > currentFrameTime) {
            beforePoint = uniqueData[i];
            afterPoint = uniqueData[i + 1];
            break;
          }
        }

        // Perfect linear interpolation between the two points
        const timeDiff = afterPoint.time - beforePoint.time;
        const priceDiff = afterPoint.price - beforePoint.price;
        const progress = timeDiff > 0 ? (currentFrameTime - beforePoint.time) / timeDiff : 0;
        const interpolatedPrice = beforePoint.price + priceDiff * progress;

        interpolated.push({
          time: currentFrameTime,
          price: interpolatedPrice,
        });

        // Move to next frame (exactly 16.67ms later)
        currentFrameTime += INTERPOLATION_INTERVAL_MS;
      }

      // Ensure we have the exact current display time point
      if (
        interpolated.length === 0 ||
        Math.abs(interpolated[interpolated.length - 1].time - displayTime) > 1
      ) {
        let beforePoint = uniqueData[0];
        let afterPoint = uniqueData[uniqueData.length - 1];

        for (let i = 0; i < uniqueData.length - 1; i++) {
          if (uniqueData[i].time <= displayTime && uniqueData[i + 1].time > displayTime) {
            beforePoint = uniqueData[i];
            afterPoint = uniqueData[i + 1];
            break;
          }
        }

        const timeDiff = afterPoint.time - beforePoint.time;
        const priceDiff = afterPoint.price - beforePoint.price;
        const progress = timeDiff > 0 ? (displayTime - beforePoint.time) / timeDiff : 0;
        const currentPrice = beforePoint.price + priceDiff * progress;

        interpolated.push({
          time: displayTime,
          price: currentPrice,
        });
      }

      // Keep only recent data (last 5 minutes)
      const cutoffTime = now - 300000;
      const filtered = interpolated.filter((p) => p.time >= cutoffTime);

      setInterpolatedHistory(filtered);
      animationId = requestAnimationFrame(updateInterpolation);
    };

    animationId = requestAnimationFrame(updateInterpolation);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [priceHistory, rawPriceBuffer]);

  return { priceHistory, interpolatedHistory };
};
