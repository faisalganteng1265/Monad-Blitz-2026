'use client';

import React from 'react';
import { useTapToTrade } from '@/features/trading/contexts/TapToTradeContext';

/**
 * SessionKeyStatus Component
 *
 * Displays the current session key status for tap-to-trade mode.
 * Shows remaining time and provides visual feedback.
 */
export function SessionKeyStatus() {
  const { sessionKey, sessionTimeRemaining, isEnabled } = useTapToTrade();

  // Don't show if tap-to-trade not enabled
  if (!isEnabled || !sessionKey) {
    return null;
  }

  // Calculate time remaining in minutes and seconds
  const totalSeconds = Math.floor(sessionTimeRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // Determine status color based on time remaining
  const getStatusColor = () => {
    if (totalSeconds <= 0) return 'text-red-500';
    if (totalSeconds < 5 * 60) return 'text-yellow-500'; // Less than 5 minutes
    return 'text-green-500';
  };

  const getStatusText = () => {
    if (totalSeconds <= 0) return 'EXPIRED';
    return 'ACTIVE';
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Status Indicator */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          totalSeconds > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`} />
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      {/* Session Time */}
      {totalSeconds > 0 && (
        <>
          <div className="h-4 w-px bg-gray-600" />
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm text-gray-300 font-mono">
              {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
            </span>
          </div>
        </>
      )}

      {/* Info Text */}
      <div className="h-4 w-px bg-gray-600" />
      <span className="text-xs text-gray-400">
        {totalSeconds > 0 ? 'No signatures needed' : 'Please re-enable'}
      </span>
    </div>
  );
}

/**
 * Compact version for displaying in header/toolbar
 */
export function SessionKeyStatusCompact() {
  const { sessionKey, sessionTimeRemaining, isEnabled } = useTapToTrade();

  if (!isEnabled || !sessionKey) {
    return null;
  }

  const totalSeconds = Math.floor(sessionTimeRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-md border border-green-500/20">
      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      <span className="text-xs font-mono text-green-400">
        {totalSeconds > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : 'EXPIRED'}
      </span>
    </div>
  );
}
