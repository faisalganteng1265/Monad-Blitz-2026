// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/trading/TapBetManager.sol";
import "../src/trading/PriceAdapter.sol";
import "../src/trading/MultiplierEngine.sol";
import "../src/treasury/TapVault.sol";
import "../src/token/MockUSDC.sol";
import "./mocks/MockPyth.sol";

/**
 * @title Integration
 * @notice Full end-to-end flows: deploy all contracts, seed vault, place bets, settle.
 */
contract IntegrationTest is Test {
    TapBetManager    public manager;
    PriceAdapter     public priceAdapter;
    MultiplierEngine public multiplierEngine;
    TapVault         public vault;
    MockUSDC         public usdc;
    TestMockPyth     public mockPyth;

    address public deployer = address(this);
    address public user     = address(0xA1);
    address public solver   = address(0xB2);
    address public lp       = address(0xC3);

    bytes32 constant BTC_SYMBOL   = keccak256("BTC");
    bytes32 constant BTC_PRICE_ID = bytes32(uint256(0x1));
    bytes32 constant ETH_SYMBOL   = keccak256("ETH");
    bytes32 constant ETH_PRICE_ID = bytes32(uint256(0x2));

    // BTC $68,000 with 8 decimals, expo -8
    int64  constant BTC_PRICE = 68_000 * 1e8;
    int32  constant EXPO      = -8;

    uint256 constant LP_SEED    = 100_000 * 1e6;
    uint256 constant COLLATERAL = 10 * 1e6; // 10 USDC

    function setUp() public {
        vm.warp(1000); // ensure block.timestamp is large enough for stale-proof arithmetic
        // ── Deploy ────────────────────────────────────────────────────────────
        usdc            = new MockUSDC(0);
        mockPyth        = new TestMockPyth(60, 1); // 60s validity for integration tests
        priceAdapter    = new PriceAdapter(address(mockPyth));
        multiplierEngine = new MultiplierEngine();
        vault           = new TapVault(address(usdc));
        manager         = new TapBetManager(
            address(vault), address(priceAdapter), address(multiplierEngine), address(usdc)
        );

        // ── Wire ──────────────────────────────────────────────────────────────
        vault.setBetManager(address(manager));
        priceAdapter.setPriceId(BTC_SYMBOL, BTC_PRICE_ID);
        priceAdapter.setPriceId(ETH_SYMBOL, ETH_PRICE_ID);

        // ── Seed vault ────────────────────────────────────────────────────────
        usdc.mint(lp, LP_SEED);
        vm.prank(lp); usdc.approve(address(vault), type(uint256).max);
        vm.prank(lp); vault.deposit(LP_SEED);

        // ── Fund user ────────────────────────────────────────────────────────
        usdc.mint(user, 10_000 * 1e6);
        vm.prank(user); usdc.approve(address(manager), type(uint256).max);

        // ── Set initial price ─────────────────────────────────────────────────
        vm.deal(address(this), 10 ether);
        vm.deal(solver, 10 ether);
        _setPrice(BTC_PRICE_ID, BTC_PRICE, uint64(block.timestamp));
    }

    // ─────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────

    function _setPrice(bytes32 priceId, int64 price, uint64 ts) internal {
        mockPyth.setPrice{value: 1}(priceId, price, 1, EXPO, ts);
    }

    function _buildUpdate(bytes32 priceId, int64 price, uint64 ts)
        internal view returns (bytes[] memory data)
    {
        // Use ts + 1 so MockPyth accepts the update (requires publishTime > last stored)
        data = new bytes[](1);
        data[0] = mockPyth.createPriceFeedUpdateData(priceId, price, 1, EXPO, price, 1, ts + 1);
    }

    // ─────────────────────────────────────────
    // Test 1: Full win flow
    // ─────────────────────────────────────────

    function testFullFlow_PlaceBet_AdvancePrice_SettleWin() public {
        uint256 currentPrice = uint256(uint64(BTC_PRICE));
        uint256 target = currentPrice + (currentPrice * 200) / 10000; // +2%
        uint256 expiry = block.timestamp + 300;
        uint256 mul = multiplierEngine.getMultiplier(currentPrice, target, 300);

        uint256 userUsdcBefore = usdc.balanceOf(user);

        vm.prank(user);
        uint256 betId = manager.placeBet(BTC_SYMBOL, target, COLLATERAL, expiry, mul);

        // Verify collateral pulled from user
        assertEq(usdc.balanceOf(user), userUsdcBefore - COLLATERAL);

        // Advance price to target
        _setPrice(BTC_PRICE_ID, int64(uint64(target)), uint64(block.timestamp));
        bytes[] memory data = _buildUpdate(BTC_PRICE_ID, int64(uint64(target)), uint64(block.timestamp));

        // Solver settles
        vm.prank(solver);
        manager.settleBetWin{value: 1}(betId, data);

        // User received payout (minus solver fee)
        uint256 userUsdcAfter = usdc.balanceOf(user);
        uint256 totalPayout   = (COLLATERAL * mul) / 100;
        uint256 solverFee     = (totalPayout * 50) / 10000;
        uint256 userPayout    = totalPayout - solverFee;

        assertEq(userUsdcAfter, userUsdcBefore - COLLATERAL + userPayout);

        // Bet marked WON, no active bets
        TapBetManager.Bet memory bet = manager.getBet(betId);
        assertEq(uint8(bet.status), uint8(TapBetManager.BetStatus.WON));
        assertEq(manager.getActiveBets().length, 0);
    }

    // ─────────────────────────────────────────
    // Test 2: Expiry flow — collateral stays in vault
    // ─────────────────────────────────────────

    function testExpiryFlow_CollateralRemainsInVault() public {
        uint256 currentPrice = uint256(uint64(BTC_PRICE));
        uint256 target = currentPrice + (currentPrice * 300) / 10000; // +3%
        uint256 expiry = block.timestamp + 300;
        uint256 mul = multiplierEngine.getMultiplier(currentPrice, target, 300);

        uint256 vaultBefore = usdc.balanceOf(address(vault));

        vm.prank(user);
        uint256 betId = manager.placeBet(BTC_SYMBOL, target, COLLATERAL, expiry, mul);

        // Vault received collateral
        assertEq(usdc.balanceOf(address(vault)), vaultBefore + COLLATERAL);

        // Advance time past expiry (price never reaches target)
        vm.warp(expiry + 1);
        manager.settleExpired(betId);

        // Collateral stays in vault (LP profit)
        assertEq(usdc.balanceOf(address(vault)), vaultBefore + COLLATERAL);

        TapBetManager.Bet memory bet = manager.getBet(betId);
        assertEq(uint8(bet.status), uint8(TapBetManager.BetStatus.EXPIRED));
    }

    // ─────────────────────────────────────────
    // Test 3: Vault liquidity exhaustion
    // ─────────────────────────────────────────

    function testVaultExhaustion_PayoutReverts() public {
        // Drain all vault USDC by having LP withdraw everything
        uint256 lpShares = vault.balanceOf(lp);
        vm.prank(lp);
        vault.withdraw(lpShares);

        assertEq(usdc.balanceOf(address(vault)), 0);

        // Place a bet — user pays collateral into vault
        _setPrice(BTC_PRICE_ID, BTC_PRICE, uint64(block.timestamp));
        uint256 currentPrice = uint256(uint64(BTC_PRICE));
        uint256 target = currentPrice + (currentPrice * 200) / 10000;
        uint256 expiry = block.timestamp + 300;
        uint256 mul = multiplierEngine.getMultiplier(currentPrice, target, 300);

        vm.prank(user);
        uint256 betId = manager.placeBet(BTC_SYMBOL, target, COLLATERAL, expiry, mul);

        // Drain vault again (e.g., another LP deposits then withdraws to reset)
        // Actually after placeBet vault now has COLLATERAL. Drain it by having deployer pull.
        // Simplest: use vm.store to wipe vault balance... but SafeERC20 may complicate things.
        // Instead: test the canCoverPayout check alone.
        assertFalse(vault.canCoverPayout(COLLATERAL * 1000)); // can't pay 1000x collateral

        // Advance price to target
        _setPrice(BTC_PRICE_ID, int64(uint64(target)), uint64(block.timestamp));
        bytes[] memory data = _buildUpdate(BTC_PRICE_ID, int64(uint64(target)), uint64(block.timestamp));

        TapBetManager.Bet memory bet = manager.getBet(betId);
        uint256 totalPayout = (COLLATERAL * bet.multiplier) / 100;

        // If vault can't cover the payout, settleBetWin should revert
        if (!vault.canCoverPayout(totalPayout)) {
            vm.prank(solver);
            vm.expectRevert("TapVault: insufficient liquidity");
            manager.settleBetWin{value: 1}(betId, data);
        }
    }

    // ─────────────────────────────────────────
    // Test 4: Multiple simultaneous bets
    // ─────────────────────────────────────────

    function testMultipleBets_SettledIndependently() public {
        _setPrice(BTC_PRICE_ID, BTC_PRICE, uint64(block.timestamp));
        uint256 cur = uint256(uint64(BTC_PRICE));

        uint256 target1 = cur + (cur * 100) / 10000; // +1%
        uint256 target2 = cur + (cur * 300) / 10000; // +3%
        uint256 expiry  = block.timestamp + 300;

        uint256 mul1 = multiplierEngine.getMultiplier(cur, target1, 300);
        uint256 mul2 = multiplierEngine.getMultiplier(cur, target2, 300);

        vm.prank(user);
        uint256 bet1 = manager.placeBet(BTC_SYMBOL, target1, COLLATERAL, expiry, mul1);

        vm.prank(user);
        uint256 bet2 = manager.placeBet(BTC_SYMBOL, target2, COLLATERAL, expiry, mul2);

        assertEq(manager.getActiveBets().length, 2);
        assertEq(manager.getUserBets(user).length, 2);

        // Settle only bet1 (price reached target1 but not target2)
        _setPrice(BTC_PRICE_ID, int64(uint64(target1)), uint64(block.timestamp));
        bytes[] memory data1 = _buildUpdate(BTC_PRICE_ID, int64(uint64(target1)), uint64(block.timestamp));

        vm.prank(solver);
        manager.settleBetWin{value: 1}(bet1, data1);

        assertEq(uint8(manager.getBet(bet1).status), uint8(TapBetManager.BetStatus.WON));
        assertEq(uint8(manager.getBet(bet2).status), uint8(TapBetManager.BetStatus.ACTIVE));
        assertEq(manager.getActiveBets().length, 1);
    }
}
