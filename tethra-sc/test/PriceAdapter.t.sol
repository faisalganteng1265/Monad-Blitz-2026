// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/trading/PriceAdapter.sol";
import "./mocks/MockPyth.sol";

contract PriceAdapterTest is Test {
    PriceAdapter public adapter;
    TestMockPyth  public mockPyth;

    address public owner = address(this);
    address public nonOwner = address(0xBEEF);

    bytes32 constant BTC_SYMBOL   = keccak256("BTC");
    bytes32 constant BTC_PRICE_ID = bytes32(uint256(0xB7C));

    // $68,000 at 8 decimals, expo -8, 68 bps confidence (~0.68%)
    int64   constant BTC_PRICE     = 68_000 * 1e8;
    uint64  constant BTC_CONF      = uint64(68_000 * 1e8 / 10000 * 68); // ~0.68%
    int32   constant EXPO          = -8;

    function setUp() public {
        vm.warp(1000); // ensure block.timestamp is large enough for stale-proof arithmetic
        mockPyth = new TestMockPyth(30, 1); // 30s validity, 1 wei fee
        adapter  = new PriceAdapter(address(mockPyth));
        adapter.setPriceId(BTC_SYMBOL, BTC_PRICE_ID);
    }

    // ─────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────

    function _buildUpdateData(
        bytes32 priceId,
        int64   price,
        uint64  conf,
        uint64  publishTime
    ) internal view returns (bytes[] memory updateData) {
        updateData = new bytes[](1);
        updateData[0] = mockPyth.createPriceFeedUpdateData(
            priceId, price, conf, EXPO, price, conf, publishTime
        );
    }

    function _fee(bytes[] memory data) internal view returns (uint256) {
        return mockPyth.getUpdateFee(data);
    }

    // ─────────────────────────────────────────
    // verifyAndGetPrice — happy path
    // ─────────────────────────────────────────

    function testVerifyAndGetPrice_ReturnsCorrectPrice() public {
        uint64 publishTime = uint64(block.timestamp);
        bytes[] memory data = _buildUpdateData(BTC_PRICE_ID, BTC_PRICE, 1, publishTime);

        (uint256 price, uint256 ts) = adapter.verifyAndGetPrice{value: _fee(data)}(data, BTC_PRICE_ID);

        assertEq(price, uint256(uint64(BTC_PRICE)));
        assertEq(ts, publishTime);
    }

    // ─────────────────────────────────────────
    // verifyAndGetPrice — stale proof
    // ─────────────────────────────────────────

    function testVerifyAndGetPrice_StaleProof_Reverts() public {
        // First set a price at current time
        uint64 t0 = uint64(block.timestamp);
        bytes[] memory freshData = _buildUpdateData(BTC_PRICE_ID, BTC_PRICE, 1, t0);
        uint256 freshFee = _fee(freshData);
        adapter.verifyAndGetPrice{value: freshFee}(freshData, BTC_PRICE_ID);

        // Warp past maxPriceAge so the stored price is now stale (31s > 30s)
        vm.warp(block.timestamp + 31);

        // Submit empty update (no new price), then try to read the now-stale price
        bytes[] memory emptyData = new bytes[](0);
        vm.expectRevert(); // will revert with PythErrors.StalePrice()
        adapter.verifyAndGetPrice{value: 0}(emptyData, BTC_PRICE_ID);
    }

    // ─────────────────────────────────────────
    // verifyAndGetPrice — wide confidence
    // ─────────────────────────────────────────

    function testVerifyAndGetPrice_WideConfidence_Reverts() public {
        // Use a newer publishTime to ensure MockPyth accepts the update
        uint64 publishTime = uint64(block.timestamp + 1);
        // conf = 2% of price = 200 bps > maxConfidenceBps=100
        uint64 wideConf = uint64(uint64(BTC_PRICE) / 50); // exactly 2%
        bytes[] memory data = _buildUpdateData(BTC_PRICE_ID, BTC_PRICE, wideConf, publishTime);

        uint256 fee = _fee(data); // evaluate before expectRevert to avoid intercepting this call
        vm.expectRevert("PriceAdapter: price confidence too wide");
        adapter.verifyAndGetPrice{value: fee}(data, BTC_PRICE_ID);
    }

    // ─────────────────────────────────────────
    // verifyAndGetPrice — exact max confidence boundary
    // ─────────────────────────────────────────

    function testVerifyAndGetPrice_ExactMaxConf_Passes() public {
        uint64 publishTime = uint64(block.timestamp);
        // conf = exactly 1% = 100 bps = maxConfidenceBps
        uint64 exactConf = uint64(uint64(BTC_PRICE) / 100);
        bytes[] memory data = _buildUpdateData(BTC_PRICE_ID, BTC_PRICE, exactConf, publishTime);

        (uint256 price,) = adapter.verifyAndGetPrice{value: _fee(data)}(data, BTC_PRICE_ID);
        assertEq(price, uint256(uint64(BTC_PRICE)));
    }

    // ─────────────────────────────────────────
    // getLatestPrice — cached read
    // ─────────────────────────────────────────

    function testGetLatestPrice_AfterVerify_ReturnsCachedPrice() public {
        uint64 publishTime = uint64(block.timestamp);
        bytes[] memory data = _buildUpdateData(BTC_PRICE_ID, BTC_PRICE, 1, publishTime);
        adapter.verifyAndGetPrice{value: _fee(data)}(data, BTC_PRICE_ID);

        (uint256 price, uint256 ts) = adapter.getLatestPrice(BTC_PRICE_ID);
        assertEq(price, uint256(uint64(BTC_PRICE)));
        assertEq(ts, publishTime);
    }

    function testGetLatestPrice_BeforeAnyUpdate_ReturnsZero() public view {
        bytes32 unknownId = bytes32(uint256(0xDEAD));
        (uint256 price, uint256 ts) = adapter.getLatestPrice(unknownId);
        assertEq(price, 0);
        assertEq(ts, 0);
    }

    // ─────────────────────────────────────────
    // setPriceId — access control
    // ─────────────────────────────────────────

    function testSetPriceId_OwnerCanSet() public view {
        assertEq(adapter.priceIds(BTC_SYMBOL), BTC_PRICE_ID);
    }

    function testSetPriceId_NonOwnerReverts() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        adapter.setPriceId(keccak256("ETH"), bytes32(uint256(0xE1A)));
    }

    function testSetPriceId_ZeroIdReverts() public {
        vm.expectRevert("PriceAdapter: zero price id");
        adapter.setPriceId(keccak256("ETH"), bytes32(0));
    }

    // ─────────────────────────────────────────
    // setMaxPriceAge / setMaxConfidenceBps — access control
    // ─────────────────────────────────────────

    function testSetMaxPriceAge_NonOwnerReverts() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        adapter.setMaxPriceAge(60);
    }

    function testSetMaxConfidenceBps_NonOwnerReverts() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        adapter.setMaxConfidenceBps(200);
    }

    // ─────────────────────────────────────────
    // Fuzz
    // ─────────────────────────────────────────

    function testFuzz_VerifyAndGetPrice_NeverRevertsOnValidFreshConf(
        int64  rawPrice,
        uint64 conf
    ) public {
        rawPrice = int64(bound(int256(rawPrice), 1e6, 1e13)); // positive, reasonable range
        // conf ≤ 1% of price
        conf = uint64(bound(uint256(conf), 0, uint256(uint64(rawPrice)) / 100));

        uint64 publishTime = uint64(block.timestamp);
        bytes[] memory data = _buildUpdateData(BTC_PRICE_ID, rawPrice, conf, publishTime);

        (uint256 price,) = adapter.verifyAndGetPrice{value: _fee(data)}(data, BTC_PRICE_ID);
        assertEq(price, uint256(uint64(rawPrice)));
    }
}
