// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/treasury/TapVault.sol";
import "../src/token/MockUSDC.sol";

contract TapVaultTest is Test {
    TapVault  public vault;
    MockUSDC  public usdc;

    address public owner      = address(this);
    address public betManager = address(0xB37);
    address public lp1        = address(0xAA);
    address public lp2        = address(0xBB);
    address public winner     = address(0xCC);
    address public nonOwner   = address(0xBEEF);

    uint256 constant INITIAL_DEPOSIT = 10_000 * 1e6; // 10,000 USDC

    function setUp() public {
        usdc  = new MockUSDC(0);
        vault = new TapVault(address(usdc));
        vault.setBetManager(betManager);

        usdc.mint(lp1, 100_000 * 1e6);
        usdc.mint(lp2, 100_000 * 1e6);
        usdc.mint(betManager, 100_000 * 1e6);

        vm.prank(lp1);
        usdc.approve(address(vault), type(uint256).max);

        vm.prank(lp2);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ─────────────────────────────────────────
    // Deposit
    // ─────────────────────────────────────────

    function testDeposit_FirstDepositorGetsScaledShares() public {
        vm.prank(lp1);
        uint256 shares = vault.deposit(INITIAL_DEPOSIT);

        // First depositor: shares = assets * SCALE (1e12)
        assertEq(shares, INITIAL_DEPOSIT * 1e12);
        assertEq(vault.balanceOf(lp1), shares);
        assertEq(vault.totalAssets(), INITIAL_DEPOSIT);
    }

    function testDeposit_SecondDepositorProportionalShares() public {
        vm.prank(lp1);
        vault.deposit(INITIAL_DEPOSIT);

        vm.prank(lp2);
        uint256 shares = vault.deposit(INITIAL_DEPOSIT);

        // Equal deposit → equal shares
        assertEq(shares, vault.balanceOf(lp1));
    }

    function testDeposit_ZeroReverts() public {
        vm.prank(lp1);
        vm.expectRevert("TapVault: zero assets");
        vault.deposit(0);
    }

    // ─────────────────────────────────────────
    // Withdraw
    // ─────────────────────────────────────────

    function testWithdraw_ReturnsProportionalAssets() public {
        vm.prank(lp1);
        uint256 shares = vault.deposit(INITIAL_DEPOSIT);

        uint256 balBefore = usdc.balanceOf(lp1);

        vm.prank(lp1);
        uint256 assets = vault.withdraw(shares);

        assertEq(assets, INITIAL_DEPOSIT);
        assertEq(usdc.balanceOf(lp1), balBefore + INITIAL_DEPOSIT);
        assertEq(vault.balanceOf(lp1), 0);
    }

    function testWithdraw_InsufficientSharesReverts() public {
        vm.prank(lp1);
        uint256 shares = vault.deposit(INITIAL_DEPOSIT);

        vm.prank(lp1);
        vm.expectRevert("TapVault: insufficient shares");
        vault.withdraw(shares + 1);
    }

    // ─────────────────────────────────────────
    // Share value increases after losses (bet loss stays in vault)
    // ─────────────────────────────────────────

    function testShareValueIncreases_AfterLossStaysInVault() public {
        // lp1 deposits 10k, lp2 deposits 10k → 50/50
        vm.prank(lp1);
        uint256 sharesBefore = vault.deposit(INITIAL_DEPOSIT);
        vm.prank(lp2);
        vault.deposit(INITIAL_DEPOSIT);

        // Simulate a losing bet: 1000 USDC collateral lands in vault (no payout)
        usdc.mint(address(vault), 1_000 * 1e6);

        // Now vault has 21,000 USDC but same supply → each share worth more
        uint256 assetsAfter = vault.convertToAssets(sharesBefore);
        assertGt(assetsAfter, INITIAL_DEPOSIT);
    }

    // ─────────────────────────────────────────
    // collectCollateral
    // ─────────────────────────────────────────

    function testCollectCollateral_BetManagerCan() public {
        // Simulate BetManager transferring collateral first, then notifying vault
        vm.prank(betManager);
        usdc.transfer(address(vault), 500 * 1e6);

        vm.prank(betManager);
        vault.collectCollateral(500 * 1e6); // just emits event
    }

    function testCollectCollateral_NonBetManagerReverts() public {
        vm.prank(nonOwner);
        vm.expectRevert("TapVault: not betManager");
        vault.collectCollateral(100 * 1e6);
    }

    function testCollectCollateral_ZeroReverts() public {
        vm.prank(betManager);
        vm.expectRevert("TapVault: zero amount");
        vault.collectCollateral(0);
    }

    // ─────────────────────────────────────────
    // payout
    // ─────────────────────────────────────────

    function testPayout_TransfersToWinner() public {
        vm.prank(lp1);
        vault.deposit(INITIAL_DEPOSIT);

        uint256 balBefore = usdc.balanceOf(winner);

        vm.prank(betManager);
        vault.payout(winner, 1_000 * 1e6);

        assertEq(usdc.balanceOf(winner), balBefore + 1_000 * 1e6);
        assertEq(vault.totalAssets(), INITIAL_DEPOSIT - 1_000 * 1e6);
    }

    function testPayout_InsufficientLiquidityReverts() public {
        vm.prank(lp1);
        vault.deposit(INITIAL_DEPOSIT);

        vm.prank(betManager);
        vm.expectRevert("TapVault: insufficient liquidity");
        vault.payout(winner, INITIAL_DEPOSIT + 1);
    }

    function testPayout_NonBetManagerReverts() public {
        vm.prank(lp1);
        vault.deposit(INITIAL_DEPOSIT);

        vm.prank(nonOwner);
        vm.expectRevert("TapVault: not betManager");
        vault.payout(winner, 100 * 1e6);
    }

    // ─────────────────────────────────────────
    // canCoverPayout
    // ─────────────────────────────────────────

    function testCanCoverPayout_TrueWhenSufficient() public {
        vm.prank(lp1);
        vault.deposit(INITIAL_DEPOSIT);

        assertTrue(vault.canCoverPayout(INITIAL_DEPOSIT));
        assertFalse(vault.canCoverPayout(INITIAL_DEPOSIT + 1));
    }

    // ─────────────────────────────────────────
    // setBetManager — access control
    // ─────────────────────────────────────────

    function testSetBetManager_NonOwnerReverts() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        vault.setBetManager(address(0x123));
    }

    function testSetBetManager_ZeroAddressReverts() public {
        vm.expectRevert("TapVault: zero address");
        vault.setBetManager(address(0));
    }

    function testSetBetManager_OwnerCanUpdate() public {
        address newManager = address(0x999);
        vault.setBetManager(newManager);
        assertEq(vault.betManager(), newManager);
    }
}
