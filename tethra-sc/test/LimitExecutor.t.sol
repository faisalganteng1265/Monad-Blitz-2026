// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/trading/LimitExecutor.sol";
import "../src/trading/PositionManager.sol";
import "../src/risk/RiskManager.sol";
import "../src/treasury/StabilityFund.sol";
import "../src/treasury/VaultPool.sol";
import "../src/token/MockUSDC.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract LimitExecutorTest is Test {
    using MessageHashUtils for bytes32;

    LimitExecutor public executor;
    PositionManager public positionManager;
    RiskManager public riskManager;
    StabilityFund public stabilityFund;
    VaultPool public vaultPool;
    MockUSDC public usdc;

    address public keeper;
    uint256 public traderPk;
    address public trader;
    uint256 public backendSignerPk;
    address public backendSigner;

    uint256 constant INITIAL_BALANCE = 100_000e6;
    uint256 constant COLLATERAL = 1_000e6;
    uint256 constant LEVERAGE = 10;
    uint256 constant TRIGGER_PRICE_LONG = 90_000e8;

    function setUp() public {
        keeper = makeAddr("keeper");
        (trader, traderPk) = makeAddrAndKey("trader");
        (backendSigner, backendSignerPk) = makeAddrAndKey("backendSigner");

        usdc = new MockUSDC(10_000_000);
        riskManager = new RiskManager();
        positionManager = new PositionManager();
        vaultPool = new VaultPool(address(usdc));
        stabilityFund = new StabilityFund(address(usdc), address(vaultPool), makeAddr("team"));

        executor = new LimitExecutor(
            address(usdc), address(riskManager), address(positionManager), address(stabilityFund), keeper, backendSigner
        );

        positionManager.grantRole(positionManager.EXECUTOR_ROLE(), address(executor));
        stabilityFund.grantRole(stabilityFund.SETTLER_ROLE(), address(executor));
        stabilityFund.updateFeeSplit(0, 0, 10000);

        riskManager.setAssetConfig("BTC", true, 25, 5_000_000e6, 20_000_000e6, 7500);

        usdc.mint(trader, INITIAL_BALANCE);
        usdc.mint(address(stabilityFund), INITIAL_BALANCE);
        usdc.mint(address(vaultPool), INITIAL_BALANCE);

        vm.prank(trader);
        usdc.approve(address(stabilityFund), type(uint256).max);
    }

    function testCreateAndExecuteLimitOpen() public {
        uint256 nonce = executor.userOrderNonces(trader);
        uint256 expiresAt = block.timestamp + 1 days;
        bytes memory userSig =
            _signOpenOrder(trader, "BTC", true, COLLATERAL, LEVERAGE, TRIGGER_PRICE_LONG, nonce, expiresAt);

        vm.prank(keeper);
        uint256 orderId = executor.createLimitOpenOrder(
            trader, "BTC", true, COLLATERAL, LEVERAGE, TRIGGER_PRICE_LONG, nonce, expiresAt, userSig
        );

        LimitExecutor.SignedPrice memory price = _signedPrice("BTC", TRIGGER_PRICE_LONG, block.timestamp);

        uint256 bufferBefore = usdc.balanceOf(address(stabilityFund));
        vm.prank(keeper);
        executor.executeLimitOpenOrder(orderId, price);

        assertEq(usdc.balanceOf(address(stabilityFund)) - bufferBefore, COLLATERAL, "Collateral should move to buffer");
        PositionManager.Position memory pos = positionManager.getPosition(orderId);
        assertEq(pos.trader, trader, "Position trader mismatch");
        assertEq(pos.size, COLLATERAL * LEVERAGE, "Position size mismatch");
    }

    // helpers
    function _signOpenOrder(
        address _trader,
        string memory symbol,
        bool isLong,
        uint256 collateral,
        uint256 leverage,
        uint256 triggerPrice,
        uint256 nonce,
        uint256 expiresAt
    ) internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                _trader, symbol, isLong, collateral, leverage, triggerPrice, nonce, expiresAt, address(executor)
            )
        );
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(traderPk, ethSignedMessageHash);
        return abi.encodePacked(r, s, v);
    }

    function _signedPrice(string memory symbol, uint256 price, uint256 timestamp)
        internal
        view
        returns (LimitExecutor.SignedPrice memory)
    {
        bytes32 messageHash = keccak256(abi.encodePacked(symbol, price, timestamp));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(backendSignerPk, ethSignedMessageHash);

        return LimitExecutor.SignedPrice({
            symbol: symbol, price: price, timestamp: timestamp, signature: abi.encodePacked(r, s, v)
        });
    }
}
