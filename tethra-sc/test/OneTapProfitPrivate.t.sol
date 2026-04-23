// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/trading/OneTapProfit.sol";
import "../src/token/MockUSDC.sol";
import "../src/treasury/StabilityFund.sol";
import "../src/treasury/VaultPool.sol";

contract OneTapProfitPrivateTest is Test {
    OneTapProfit public otp;
    MockUSDC public usdc;
    StabilityFund public stabilityFund;
    VaultPool public vaultPool;

    address public deployer;
    address public keeper;
    address public settler;
    address public creSettler;
    address public trader;
    address public relayWallet;

    uint256 constant INITIAL_BALANCE = 1_000_000e6;

    function setUp() public {
        deployer = address(this);
        keeper = makeAddr("keeper");
        settler = makeAddr("settler");
        creSettler = makeAddr("creSettler");
        trader = makeAddr("trader");
        relayWallet = makeAddr("relayWallet");

        usdc = new MockUSDC(10_000_000);
        vaultPool = new VaultPool(address(usdc));
        stabilityFund = new StabilityFund(address(usdc), address(vaultPool), makeAddr("team"));

        otp = new OneTapProfit(
            address(usdc),
            address(stabilityFund),
            makeAddr("backendSigner"),
            keeper,
            settler
        );

        // Grant roles
        stabilityFund.grantRole(stabilityFund.SETTLER_ROLE(), address(otp));
        vaultPool.grantRole(vaultPool.SETTLER_ROLE(), address(stabilityFund));
        otp.grantRole(otp.CRE_SETTLER_ROLE(), creSettler);

        // Fund accounts
        usdc.mint(keeper, INITIAL_BALANCE); // Keeper is msg.sender for placeBetPrivate
        usdc.mint(address(stabilityFund), INITIAL_BALANCE);
        usdc.mint(address(vaultPool), INITIAL_BALANCE);

        // Keeper approves StabilityFund (keeper = msg.sender in placeBetPrivate)
        vm.prank(keeper);
        usdc.approve(address(stabilityFund), type(uint256).max);
    }

    function _makeCommitment(
        address _trader,
        uint256 _betAmount,
        uint256 _targetPrice,
        bool _isUp,
        bytes32 _secret
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_trader, _betAmount, _targetPrice, _isUp, _secret));
    }

    function testPrivateBetPlacement() public {
        bytes32 secret = keccak256("test_secret");
        bytes32 commitment = _makeCommitment(trader, 5e6, 50000e8, true, secret);

        vm.prank(keeper);
        uint256 betId = otp.placeBetPrivate(
            commitment,
            "BTC",
            block.timestamp + 60,
            5e6,
            150 // 1.5x
        );

        assertEq(betId, 0);

        // Verify on-chain data — commitment stored, NO trader address visible
        (
            uint256 _betId,
            string memory _symbol,
            uint256 _targetTime,
            uint256 _collateral,
            uint256 _multiplier,
            bytes32 _commitment,
            OneTapProfit.BetStatus _status,
            ,
        ) = otp.privateBets(betId);

        assertEq(_betId, 0);
        assertEq(_symbol, "BTC");
        assertEq(_collateral, 5e6);
        assertEq(_multiplier, 150);
        assertEq(_commitment, commitment);
        assertEq(uint8(_status), uint8(OneTapProfit.BetStatus.ACTIVE));
    }

    function testBatchSettlement() public {
        bytes32 secret1 = keccak256("secret1");
        bytes32 secret2 = keccak256("secret2");
        bytes32 commitment1 = _makeCommitment(trader, 5e6, 50000e8, true, secret1);
        bytes32 commitment2 = _makeCommitment(trader, 10e6, 50000e8, false, secret2);

        // Place 2 bets
        vm.startPrank(keeper);
        uint256 betId1 = otp.placeBetPrivate(commitment1, "BTC", block.timestamp + 60, 5e6, 150);
        uint256 betId2 = otp.placeBetPrivate(commitment2, "BTC", block.timestamp + 60, 10e6, 200);
        vm.stopPrank();

        uint256 traderBalBefore = usdc.balanceOf(trader);

        // Batch settle — bet1 wins, bet2 loses
        uint256[] memory betIds = new uint256[](2);
        address[] memory traders = new address[](2);
        uint256[] memory settlePrices = new uint256[](2);
        bool[] memory wonArr = new bool[](2);

        betIds[0] = betId1;
        betIds[1] = betId2;
        traders[0] = trader;
        traders[1] = trader;
        settlePrices[0] = 50005e8;
        settlePrices[1] = 49000e8;
        wonArr[0] = true;
        wonArr[1] = false;

        vm.prank(creSettler);
        otp.settleBetBatch(betIds, traders, settlePrices, wonArr, hex"00");

        // Verify statuses
        (, , , , , , OneTapProfit.BetStatus status1, ,) = otp.privateBets(betId1);
        (, , , , , , OneTapProfit.BetStatus status2, ,) = otp.privateBets(betId2);

        assertEq(uint8(status1), uint8(OneTapProfit.BetStatus.WON));
        assertEq(uint8(status2), uint8(OneTapProfit.BetStatus.LOST));

        // Verify trader received payout for bet1 (5 USDC * 1.5x = 7.5 USDC, minus fee)
        uint256 traderBalAfter = usdc.balanceOf(trader);
        assertGt(traderBalAfter, traderBalBefore);
    }

    function testOnlyCRECanSettle() public {
        bytes32 commitment = _makeCommitment(trader, 5e6, 50000e8, true, keccak256("s"));

        vm.prank(keeper);
        uint256 betId = otp.placeBetPrivate(commitment, "BTC", block.timestamp + 60, 5e6, 150);

        uint256[] memory betIds = new uint256[](1);
        address[] memory traders = new address[](1);
        uint256[] memory settlePrices = new uint256[](1);
        bool[] memory wonArr = new bool[](1);

        betIds[0] = betId;
        traders[0] = trader;
        settlePrices[0] = 50000e8;
        wonArr[0] = true;

        // Random address should revert
        address randomUser = makeAddr("random");
        vm.prank(randomUser);
        vm.expectRevert();
        otp.settleBetBatch(betIds, traders, settlePrices, wonArr, hex"00");

        // Keeper should also revert (wrong role)
        vm.prank(keeper);
        vm.expectRevert();
        otp.settleBetBatch(betIds, traders, settlePrices, wonArr, hex"00");
    }

    function testInvalidDenomination() public {
        bytes32 commitment = _makeCommitment(trader, 7e6, 50000e8, true, keccak256("s"));

        vm.prank(keeper);
        vm.expectRevert("OneTapProfit: Invalid denomination");
        otp.placeBetPrivate(commitment, "BTC", block.timestamp + 60, 7e6, 150);
    }

    function testInvalidMultiplier() public {
        bytes32 commitment = _makeCommitment(trader, 5e6, 50000e8, true, keccak256("s"));

        // Multiplier too low (< 100)
        vm.prank(keeper);
        vm.expectRevert("OneTapProfit: Invalid multiplier");
        otp.placeBetPrivate(commitment, "BTC", block.timestamp + 60, 5e6, 50);

        // Multiplier too high (> 2000)
        vm.prank(keeper);
        vm.expectRevert("OneTapProfit: Invalid multiplier");
        otp.placeBetPrivate(commitment, "BTC", block.timestamp + 60, 5e6, 2500);
    }

    function testAllValidDenominations() public {
        uint256[4] memory denoms = [uint256(5e6), 10e6, 50e6, 100e6];

        for (uint256 i = 0; i < denoms.length; i++) {
            bytes32 commitment = keccak256(abi.encodePacked("test", i));

            vm.prank(keeper);
            uint256 betId = otp.placeBetPrivate(
                commitment,
                "BTC",
                block.timestamp + 60,
                denoms[i],
                150
            );

            (, , , uint256 collateral, , , , ,) = otp.privateBets(betId);
            assertEq(collateral, denoms[i]);
        }
    }

    function testNonKeeperCannotPlaceBet() public {
        bytes32 commitment = _makeCommitment(trader, 5e6, 50000e8, true, keccak256("s"));

        vm.prank(trader);
        vm.expectRevert();
        otp.placeBetPrivate(commitment, "BTC", block.timestamp + 60, 5e6, 150);
    }
}
