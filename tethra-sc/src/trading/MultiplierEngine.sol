// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MultiplierEngine
 * @notice Single source of truth for bet multipliers. Maps (price distance band, time bucket) → multiplier.
 * @dev Multipliers are in basis 100 (e.g. 800 = 8x). Symmetric for UP and DOWN bets.
 */
contract MultiplierEngine is Ownable {
    // Price distance bands (percentage distance in basis points)
    uint8 public constant BAND_0_5  = 0; // 0%   – 0.5%  (0   – 50 bps)
    uint8 public constant BAND_1    = 1; // 0.5% – 1%    (50  – 100 bps)
    uint8 public constant BAND_2    = 2; // 1%   – 2%    (100 – 200 bps)
    uint8 public constant BAND_5    = 3; // 2%   – 5%    (200 – 500 bps)
    uint8 public constant BAND_10   = 4; // 5%   – 10%   (500 – 1000 bps)
    uint8 public constant BAND_OVER = 5; // >10%          (>1000 bps)

    // Time buckets
    uint8 public constant TIME_1M  = 0; // 1 minute   (≤ 60s)
    uint8 public constant TIME_5M  = 1; // 5 minutes  (≤ 300s)
    uint8 public constant TIME_15M = 2; // 15 minutes (≤ 900s)
    uint8 public constant TIME_30M = 3; // 30 minutes (≤ 1800s)
    uint8 public constant TIME_1H  = 4; // 1 hour     (≤ 3600s)

    // multiplierTable[priceBand][timeBucket] = multiplier (basis 100)
    uint256[5][6] public multiplierTable;

    event MultiplierUpdated(uint8 indexed priceBand, uint8 indexed timeBucket, uint256 multiplier);

    constructor() Ownable(msg.sender) {
        // Band 0: 0–0.5%
        multiplierTable[0][0] = 150;   // 1m  → 1.5x
        multiplierTable[0][1] = 120;   // 5m  → 1.2x
        multiplierTable[0][2] = 110;   // 15m → 1.1x
        multiplierTable[0][3] = 105;   // 30m → 1.05x
        multiplierTable[0][4] = 102;   // 1h  → 1.02x

        // Band 1: 0.5–1%
        multiplierTable[1][0] = 600;   // 1m  → 6x
        multiplierTable[1][1] = 400;   // 5m  → 4x
        multiplierTable[1][2] = 250;   // 15m → 2.5x
        multiplierTable[1][3] = 180;   // 30m → 1.8x
        multiplierTable[1][4] = 130;   // 1h  → 1.3x

        // Band 2: 1–2%
        multiplierTable[2][0] = 1500;  // 1m  → 15x
        multiplierTable[2][1] = 800;   // 5m  → 8x
        multiplierTable[2][2] = 500;   // 15m → 5x
        multiplierTable[2][3] = 300;   // 30m → 3x
        multiplierTable[2][4] = 200;   // 1h  → 2x

        // Band 3: 2–5%
        multiplierTable[3][0] = 5000;  // 1m  → 50x
        multiplierTable[3][1] = 2500;  // 5m  → 25x
        multiplierTable[3][2] = 1200;  // 15m → 12x
        multiplierTable[3][3] = 600;   // 30m → 6x
        multiplierTable[3][4] = 350;   // 1h  → 3.5x

        // Band 4: 5–10%
        multiplierTable[4][0] = 20000; // 1m  → 200x
        multiplierTable[4][1] = 8000;  // 5m  → 80x
        multiplierTable[4][2] = 3000;  // 15m → 30x
        multiplierTable[4][3] = 1500;  // 30m → 15x
        multiplierTable[4][4] = 700;   // 1h  → 7x

        // Band 5: >10%
        multiplierTable[5][0] = 50000; // 1m  → 500x
        multiplierTable[5][1] = 20000; // 5m  → 200x
        multiplierTable[5][2] = 8000;  // 15m → 80x
        multiplierTable[5][3] = 3000;  // 30m → 30x
        multiplierTable[5][4] = 1500;  // 1h  → 15x
    }

    /**
     * @notice Compute multiplier (basis 100) for a bet.
     * @param currentPrice Current market price (8 decimals, Pyth format)
     * @param targetPrice Target price the user is betting on (8 decimals)
     * @param timeToExpiry Seconds remaining until the bet's expiry
     * @return multiplier Payout multiplier in basis 100 (e.g. 800 = 8x)
     */
    function getMultiplier(
        uint256 currentPrice,
        uint256 targetPrice,
        uint256 timeToExpiry
    ) external view returns (uint256 multiplier) {
        require(currentPrice > 0, "MultiplierEngine: zero current price");
        require(targetPrice > 0, "MultiplierEngine: zero target price");

        // Calculate absolute price distance in basis points
        uint256 distanceBps;
        if (targetPrice >= currentPrice) {
            distanceBps = ((targetPrice - currentPrice) * 10000) / currentPrice;
        } else {
            distanceBps = ((currentPrice - targetPrice) * 10000) / currentPrice;
        }

        uint8 priceBand = _getPriceBand(distanceBps);
        uint8 timeBucket = _getTimeBucket(timeToExpiry);

        return multiplierTable[priceBand][timeBucket];
    }

    /**
     * @notice Update a single table entry (owner only, for governance/rebalancing)
     */
    function setMultiplier(uint8 priceBand, uint8 timeBucket, uint256 newMultiplier) external onlyOwner {
        require(priceBand <= BAND_OVER, "MultiplierEngine: invalid band");
        require(timeBucket <= TIME_1H, "MultiplierEngine: invalid bucket");
        require(newMultiplier >= 101, "MultiplierEngine: multiplier must be > 1x");
        multiplierTable[priceBand][timeBucket] = newMultiplier;
        emit MultiplierUpdated(priceBand, timeBucket, newMultiplier);
    }

    /**
     * @dev Map absolute price distance (bps) to a price band index.
     */
    function _getPriceBand(uint256 distanceBps) internal pure returns (uint8) {
        if (distanceBps <= 50)   return BAND_0_5;  // 0–0.5%
        if (distanceBps <= 100)  return BAND_1;    // 0.5–1%
        if (distanceBps <= 200)  return BAND_2;    // 1–2%
        if (distanceBps <= 500)  return BAND_5;    // 2–5%
        if (distanceBps <= 1000) return BAND_10;   // 5–10%
        return BAND_OVER;                          // >10%
    }

    /**
     * @dev Map timeToExpiry (seconds) to a time bucket index.
     */
    function _getTimeBucket(uint256 timeToExpiry) internal pure returns (uint8) {
        if (timeToExpiry <= 60)   return TIME_1M;
        if (timeToExpiry <= 300)  return TIME_5M;
        if (timeToExpiry <= 900)  return TIME_15M;
        if (timeToExpiry <= 1800) return TIME_30M;
        return TIME_1H;
    }
}
