'use client';

import React, { useEffect, useState } from 'react';

/**
 * Real-time clock component displaying Jakarta time (GMT+7)
 */
export default function RealTimeClock() {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();

      // Convert to Jakarta time (GMT+7)
      const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));

      // Format time (HH:MM:SS)
      const hours = jakartaTime.getHours().toString().padStart(2, '0');
      const minutes = jakartaTime.getMinutes().toString().padStart(2, '0');
      const seconds = jakartaTime.getSeconds().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}:${seconds}`;

      // Format date (DD MMM YYYY)

      setCurrentTime(timeString);
    };

    // Update immediately
    updateTime();

    // Update every second
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col">
      <span className="text-xs text-text-secondary">Jakarta Time (GMT+7)</span>
      <div className="flex flex-col">
        <span className="font-semibold font-mono text-sm text-text-primary">{currentTime}</span>
      </div>
    </div>
  );
}
