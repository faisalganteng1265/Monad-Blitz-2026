// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/trading/MultiplierEngine.sol";

contract MultiplierEngineTest is Test {
    MultiplierEngine public engine;

    address public owner = address(this);
    address public nonOwner = address(0xBEEF);

    // Reference price: $68,000 with 8 decimals
    uint256 constant BASE_PRICE = 68_000 * 1e8;

    function setUp() public {
        engine = new MultiplierEngine();
    }

    // ─────────────────────────────────────────
    // Table completeness — all 30 cells
    // ─────────────────────────────────────────

    function testBand0_AllTimeBuckets() public view {
        // 0–0.5%: use 0.3% distance (30 bps) → BAND_0_5
        uint256 target = BASE_PRICE + (BASE_PRICE * 30) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60),   150);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 300),  120);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 900),  110);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 1800), 105);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 3600), 102);
    }

    function testBand1_AllTimeBuckets() public view {
        // 0.5–1%: use 0.75% distance (75 bps) → BAND_1
        uint256 target = BASE_PRICE + (BASE_PRICE * 75) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60),   600);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 300),  400);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 900),  250);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 1800), 180);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 3600), 130);
    }

    function testBand2_AllTimeBuckets() public view {
        // 1–2%: use 1.5% distance (150 bps) → BAND_2
        uint256 target = BASE_PRICE + (BASE_PRICE * 150) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60),   1500);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 300),  800);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 900),  500);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 1800), 300);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 3600), 200);
    }

    function testBand3_AllTimeBuckets() public view {
        // 2–5%: use 3% distance (300 bps) → BAND_5
        uint256 target = BASE_PRICE + (BASE_PRICE * 300) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60),   5000);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 300),  2500);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 900),  1200);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 1800), 600);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 3600), 350);
    }

    function testBand4_AllTimeBuckets() public view {
        // 5–10%: use 7% distance (700 bps) → BAND_10
        uint256 target = BASE_PRICE + (BASE_PRICE * 700) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60),   20000);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 300),  8000);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 900),  3000);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 1800), 1500);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 3600), 700);
    }

    function testBand5_AllTimeBuckets() public view {
        // >10%: use 15% distance (1500 bps) → BAND_OVER
        uint256 target = BASE_PRICE + (BASE_PRICE * 1500) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60),   50000);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 300),  20000);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 900),  8000);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 1800), 3000);
        assertEq(engine.getMultiplier(BASE_PRICE, target, 3600), 1500);
    }

    // ─────────────────────────────────────────
    // Band boundary edge cases
    // ─────────────────────────────────────────

    function testBandBoundary_ExactlyFiftyBps_IsBand0() public view {
        // 50 bps = exactly 0.5% → should be BAND_0_5
        uint256 target = BASE_PRICE + (BASE_PRICE * 50) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60), 150);
    }

    function testBandBoundary_FiftyOneBps_IsBand1() public view {
        // 51 bps > 0.5% → should be BAND_1
        uint256 target = BASE_PRICE + (BASE_PRICE * 51) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60), 600);
    }

    function testBandBoundary_ExactlyHundredBps_IsBand1() public view {
        // 100 bps = exactly 1% → should be BAND_1
        uint256 target = BASE_PRICE + (BASE_PRICE * 100) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60), 600);
    }

    function testBandBoundary_HundredOneBps_IsBand2() public view {
        // 101 bps > 1% → should be BAND_2
        uint256 target = BASE_PRICE + (BASE_PRICE * 101) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60), 1500);
    }

    // ─────────────────────────────────────────
    // Time bucket boundary edge cases
    // ─────────────────────────────────────────

    function testTimeBucket_ExactlyOneMinute() public view {
        uint256 target = BASE_PRICE + (BASE_PRICE * 200) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 60), 1500); // BAND_2, TIME_1M
    }

    function testTimeBucket_SixtyOneSeconds_Is5M() public view {
        uint256 target = BASE_PRICE + (BASE_PRICE * 200) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 61), 800); // BAND_2, TIME_5M
    }

    // ─────────────────────────────────────────
    // Symmetry (UP = DOWN for same distance)
    // ─────────────────────────────────────────

    function testSymmetry_UpAndDownSameMultiplier() public view {
        uint256 targetUp   = BASE_PRICE + (BASE_PRICE * 200) / 10000;
        uint256 targetDown = BASE_PRICE - (BASE_PRICE * 200) / 10000;
        assertEq(
            engine.getMultiplier(BASE_PRICE, targetUp, 300),
            engine.getMultiplier(BASE_PRICE, targetDown, 300)
        );
    }

    // ─────────────────────────────────────────
    // setMultiplier — access control
    // ─────────────────────────────────────────

    function testSetMultiplier_OwnerCanUpdate() public {
        engine.setMultiplier(2, 1, 900); // BAND_2, TIME_5M → 9x
        uint256 target = BASE_PRICE + (BASE_PRICE * 150) / 10000;
        assertEq(engine.getMultiplier(BASE_PRICE, target, 300), 900);
    }

    function testSetMultiplier_NonOwnerReverts() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        engine.setMultiplier(2, 1, 900);
    }

    function testSetMultiplier_InvalidBandReverts() public {
        vm.expectRevert("MultiplierEngine: invalid band");
        engine.setMultiplier(6, 0, 200);
    }

    function testSetMultiplier_InvalidBucketReverts() public {
        vm.expectRevert("MultiplierEngine: invalid bucket");
        engine.setMultiplier(0, 5, 200);
    }

    // ─────────────────────────────────────────
    // Fuzz tests
    // ─────────────────────────────────────────

    function testFuzz_GetMultiplier_NeverReverts(
        uint256 currentPrice,
        uint256 targetPrice,
        uint256 timeToExpiry
    ) public view {
        currentPrice = bound(currentPrice, 1e6, 1e18);
        targetPrice  = bound(targetPrice, 1e6, 1e18);
        timeToExpiry = bound(timeToExpiry, 1, 86400);
        engine.getMultiplier(currentPrice, targetPrice, timeToExpiry);
    }
}
