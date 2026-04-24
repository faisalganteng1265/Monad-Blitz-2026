// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/**
 * @title PriceAdapter
 * @notice Wraps Pyth Network oracle. Verifies price proofs on-chain and provides cached prices for display.
 * @dev maxPriceAge: proof must be ≤30s old. maxConfidenceBps: conf/price ≤ 1% (100 bps).
 */
contract PriceAdapter is Ownable {
    IPyth public immutable pyth;

    uint256 public maxPriceAge = 30;        // seconds
    uint256 public maxConfidenceBps = 100;  // 1% = 100 bps

    // symbol hash → Pyth price feed ID
    mapping(bytes32 => bytes32) public priceIds;

    event PriceIdSet(bytes32 indexed symbol, bytes32 indexed pythPriceId);
    event MaxPriceAgeUpdated(uint256 newAge);
    event MaxConfidenceUpdated(uint256 newBps);

    constructor(address pythContract) Ownable(msg.sender) {
        require(pythContract != address(0), "PriceAdapter: zero pyth address");
        pyth = IPyth(pythContract);
    }

    /**
     * @notice Register a symbol → Pyth price feed ID mapping.
     * @param symbol  keccak256 of the asset symbol string (e.g. keccak256("BTC"))
     * @param pythPriceId  Pyth price feed ID from https://pyth.network/price-feeds
     */
    function setPriceId(bytes32 symbol, bytes32 pythPriceId) external onlyOwner {
        require(pythPriceId != bytes32(0), "PriceAdapter: zero price id");
        priceIds[symbol] = pythPriceId;
        emit PriceIdSet(symbol, pythPriceId);
    }

    function setMaxPriceAge(uint256 age) external onlyOwner {
        require(age > 0, "PriceAdapter: zero age");
        maxPriceAge = age;
        emit MaxPriceAgeUpdated(age);
    }

    function setMaxConfidenceBps(uint256 bps) external onlyOwner {
        require(bps > 0 && bps <= 10000, "PriceAdapter: invalid bps");
        maxConfidenceBps = bps;
        emit MaxConfidenceUpdated(bps);
    }

    /**
     * @notice Submit a Pyth price proof on-chain, validate freshness and confidence, return 8-decimal price.
     * @param priceUpdateData  Signed VAA bytes from Pyth Hermes API
     * @param priceId          Pyth price feed ID to read
     * @return price           8-decimal unsigned price (matches Pyth's -8 exponent feeds)
     * @return publishTime     Unix timestamp of the price
     */
    function verifyAndGetPrice(
        bytes[] calldata priceUpdateData,
        bytes32 priceId
    ) external payable returns (uint256 price, uint256 publishTime) {
        uint256 fee = pyth.getUpdateFee(priceUpdateData);
        pyth.updatePriceFeeds{value: fee}(priceUpdateData);

        PythStructs.Price memory p = pyth.getPriceNoOlderThan(priceId, maxPriceAge);

        require(p.price > 0, "PriceAdapter: non-positive price");
        require(p.expo == -8, "PriceAdapter: unexpected exponent");

        // Confidence check: conf/price ≤ maxConfidenceBps/10000
        uint256 confBps = (uint256(p.conf) * 10000) / uint256(uint64(p.price));
        require(confBps <= maxConfidenceBps, "PriceAdapter: price confidence too wide");

        price = uint256(uint64(p.price));
        publishTime = p.publishTime;
    }

    /**
     * @notice Return the latest cached 8-decimal price without verifying a proof.
     * @dev For UI display only — do NOT use for settlement. Returns (0, 0) if no price exists.
     */
    function getLatestPrice(bytes32 priceId)
        external view
        returns (uint256 price, uint256 publishTime)
    {
        try pyth.getPriceUnsafe(priceId) returns (PythStructs.Price memory p) {
            if (p.price <= 0 || p.expo != -8) return (0, 0);
            price = uint256(uint64(p.price));
            publishTime = p.publishTime;
        } catch {
            return (0, 0);
        }
    }

    receive() external payable {}
}
