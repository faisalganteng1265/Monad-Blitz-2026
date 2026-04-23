import { useEffect, useState } from 'react';
import { PricePoint } from '../types';
import { DEFAULT_GRID_Y_PERCENT } from '../constants';

interface UseChartFocusProps {
  isFocusMode: boolean;
  interpolatedHistory: PricePoint[];
  dimensions: { width: number; height: number };
  gridIntervalSeconds: number;
  initialPrice: number;
  currentPrice: number;
  gridYDollars: number; // Added
  setScrollOffset: (offset: number) => void;
  setVerticalOffset: (offset: number) => void;
}

export const useChartFocus = ({
  isFocusMode,
  interpolatedHistory,
  dimensions,
  gridIntervalSeconds,
  initialPrice,
  currentPrice,
  gridYDollars,
  setScrollOffset,
  setVerticalOffset,
}: UseChartFocusProps) => {
  const [blinkState, setBlinkState] = useState<boolean>(true);

  // Blinking effect
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinkState((prev) => !prev);
    }, 500);

    return () => clearInterval(blinkInterval);
  }, []);

  // Auto-follow focus (Center Lock)
  useEffect(() => {
    if (
      !isFocusMode ||
      (interpolatedHistory.length === 0 && currentPrice === 0) ||
      dimensions.width === 0 ||
      dimensions.height === 0 ||
      gridYDollars === 0
    ) {
      return;
    }

    const updateFocus = () => {
      // 1. Horizontal Centering (Time)
      // Lock the "Head" at 20% of the chart width (Left side) to see more future
      const chartWidth = dimensions.width - 80;
      const targetX = chartWidth * 0.2;
      const nowX = chartWidth * 0.2; // The "base" X position of 'now' in the drawing logic logic

      // Get latest point (Head)
      const latestPoint =
        interpolatedHistory.length > 0
          ? interpolatedHistory[interpolatedHistory.length - 1]
          : { time: Date.now(), price: currentPrice };

      // Calculate where the head *would* be without scrolling
      const gridSizePixels = (dimensions.height - 30) / 10; // Assuming 10 vertical grids
      const pixelsPerSecond = gridSizePixels / gridIntervalSeconds;

      const now = Date.now();
      const secondsFromNow = (latestPoint.time - now) / 1000;
      const circleCurrentX = nowX + secondsFromNow * pixelsPerSecond;

      // Scroll to bring circleCurrentX to targetX
      const newScrollOffset = circleCurrentX - targetX;
      setScrollOffset(newScrollOffset);

      // 2. Vertical Centering (Price)
      // We want the latest price to be exactly in the vertical center
      const pixelsPerDollar = gridSizePixels / gridYDollars;

      // Calculate how much the price differs from the "base" anchor
      // In index.tsx, the base center is the `priceAnchor` (initialPrice)
      // We want `latestPoint.price` to be at the visual center.
      // Offset = (TargetPrice - AnchorPrice) * PixelsPerDollar
      const priceAnchor = initialPrice > 0 ? initialPrice : currentPrice;
      const priceDiff = latestPoint.price - priceAnchor;

      // We set verticalOffset. In index.tsx:
      // displayCenter = priceAnchor + (verticalOffset / pixelsPerDollar)
      // We want displayCenter = latestPoint.price
      // So: latestPoint.price = priceAnchor + (verticalOffset / pixelsPerDollar)
      // verticalOffset = (latestPoint.price - priceAnchor) * pixelsPerDollar

      // Note: We invert the sign if the Y-axis direction in generic math,
      // but usually 'offset' shifts the view 'window'.
      // If we increase verticalOffset (positive), displayMin/Max increase (window moves UP).
      // So if Price is HIGHER than anchor, window needs to move UP to keep it centered.
      // So Positive Offset is correct.

      const newVerticalOffset = priceDiff * pixelsPerDollar;
      setVerticalOffset(newVerticalOffset);
    };

    // Run immediately and on updates
    updateFocus();

    // Use animation frame for smoother following if history updates frequently?
    // Actually the hook dependency `interpolatedHistory` changes every frame (60fps)
    // so this useEffect runs every frame. This gives perfectly smooth locking.
  }, [
    interpolatedHistory,
    isFocusMode,
    dimensions,
    gridIntervalSeconds,
    initialPrice,
    currentPrice,
    gridYDollars,
    setScrollOffset,
    setVerticalOffset,
  ]);

  return { blinkState };
};
