/**
 * Hook to fetch and manage real-time prices from backend
 * Uses WebSocket for instant real-time updates
 */

import { useState, useEffect } from 'react';
import { BACKEND_API_URL } from '@/config/contracts';

interface PriceData {
  symbol: string;
  price: number;
  confidence: number;
  timestamp: number;
}

interface PricesState {
  [symbol: string]: PriceData;
}

let sharedPrices: PricesState = {};
const priceListeners: Set<() => void> = new Set();
let ws: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;

// WebSocket connection
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return; // Already connected
  }

  try {
    // Convert http/https to ws/wss
    const wsUrl = BACKEND_API_URL.replace(/^http/, 'ws') + '/ws/price';

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'price_update' && data.data) {
          // Update all prices at once (backend uses 'data' field)
          sharedPrices = data.data;

          // Notify all listeners
          priceListeners.forEach((listener) => listener());
        }
      } catch (error) {}
    };

    ws.onerror = (error) => {};

    ws.onclose = () => {
      ws = null;

      // Reconnect after 2 seconds
      reconnectTimeout = setTimeout(() => {
        if (priceListeners.size > 0) {
          connectWebSocket();
        }
      }, 2000);
    };
  } catch (error) {}
}

// Start WebSocket if not already started
function startPriceStream() {
  connectWebSocket();

  // Also fetch initial prices via REST as fallback
  fetch(`${BACKEND_API_URL}/api/price/all`)
    .then((res) => res.json())
    .then((result) => {
      if (result.success && result.data) {
        sharedPrices = result.data;
        priceListeners.forEach((listener) => listener());
      }
    })
    .catch((err) => {});
}

// Stop WebSocket if no more listeners
function stopPriceStream() {
  if (priceListeners.size === 0) {
    if (ws) {
      ws.close();
      ws = null;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  }
}

/**
 * Hook to get current price for a specific symbol
 */
export function usePrice(symbol: string | undefined) {
  const [price, setPrice] = useState<PriceData | null>(
    symbol && sharedPrices[symbol] ? sharedPrices[symbol] : null,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!symbol) {
      setIsLoading(false);
      return;
    }

    // Update function
    const updatePrice = () => {
      const currentPrice = sharedPrices[symbol];
      if (currentPrice) {
        setPrice(currentPrice);
        setIsLoading(false);
      }
    };

    // Add listener
    priceListeners.add(updatePrice);

    // Start WebSocket stream
    startPriceStream();

    // Initial update
    updatePrice();

    // Cleanup
    return () => {
      priceListeners.delete(updatePrice);
      stopPriceStream();
    };
  }, [symbol]);

  return { price, isLoading };
}

/**
 * Hook to get all current prices
 */
export function useAllPrices() {
  const [prices, setPrices] = useState<PricesState>(sharedPrices);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const updatePrices = () => {
      setPrices({ ...sharedPrices });
      setIsLoading(false);
    };

    priceListeners.add(updatePrices);
    startPriceStream();
    updatePrices();

    return () => {
      priceListeners.delete(updatePrices);
      stopPriceStream();
    };
  }, []);

  return { prices, isLoading };
}
