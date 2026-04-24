// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@pythnetwork/pyth-sdk-solidity/MockPyth.sol" as PythMock;

/**
 * @dev Thin re-export of the Pyth SDK MockPyth for use in tests.
 *      Use createPriceFeedUpdateData() to build updateData bytes[] and setPrice() to seed cached price.
 */
contract TestMockPyth is PythMock.MockPyth {
    constructor(uint validTimePeriod, uint singleUpdateFeeInWei)
        PythMock.MockPyth(validTimePeriod, singleUpdateFeeInWei)
    {}

    function setPrice(bytes32 priceId, int64 price, uint64 conf, int32 expo, uint64 publishTime)
        external payable
    {
        bytes memory encoded = createPriceFeedUpdateData(
            priceId, price, conf, expo, price, conf, publishTime
        );
        bytes[] memory updateData = new bytes[](1);
        updateData[0] = encoded;
        uint256 fee = singleUpdateFee(updateData);
        this.updatePriceFeeds{value: fee}(updateData);
    }

    function singleUpdateFee(bytes[] memory updateData) public view returns (uint256) {
        return this.getUpdateFee(updateData);
    }
}
