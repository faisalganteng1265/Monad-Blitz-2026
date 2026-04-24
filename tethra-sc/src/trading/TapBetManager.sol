// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ITapVault {
    function collectCollateral(uint256 amount) external;
    function payout(address to, uint256 amount) external;
    function canCoverPayout(uint256 amount) external view returns (bool);
}

interface IPriceAdapter {
    function verifyAndGetPrice(bytes[] calldata priceUpdateData, bytes32 priceId)
        external payable returns (uint256 price, uint256 publishTime);
    function getLatestPrice(bytes32 priceId)
        external view returns (uint256 price, uint256 publishTime);
    function priceIds(bytes32 symbol) external view returns (bytes32);
}

interface IMultiplierEngine {
    function getMultiplier(uint256 currentPrice, uint256 targetPrice, uint256 timeToExpiry)
        external view returns (uint256);
}

/**
 * @title TapBetManager
 * @notice Core bet lifecycle: place, settle wins (permissionless), settle expired bets.
 * @dev Users approve this contract for USDC. This contract pulls from user and sends to vault.
 *      Any address can call settleBetWin and earn a 0.5% finder fee.
 */
contract TapBetManager is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum Direction { UP, DOWN }
    enum BetStatus  { ACTIVE, WON, EXPIRED }

    struct Bet {
        uint256   betId;
        address   user;
        bytes32   symbol;       // keccak256("BTC") etc.
        uint256   targetPrice;  // 8-decimal unsigned
        uint256   collateral;   // USDC, 6-decimal
        uint256   multiplier;   // basis-100 (800 = 8x)
        Direction direction;
        uint256   expiry;       // unix timestamp
        BetStatus status;
        uint256   placedAt;
    }

    // ─── Storage ───────────────────────────────────────────────────────────────

    mapping(uint256 => Bet)     public bets;
    mapping(address => uint256[]) public userBets;
    uint256[]                   public activeBetIds;
    uint256                     public nextBetId;

    ITapVault        public immutable vault;
    IPriceAdapter    public immutable priceAdapter;
    IMultiplierEngine public immutable multiplierEngine;
    IERC20           public immutable usdc;

    uint256 public SETTLER_FEE_BPS = 50; // 0.5%
    uint256 public constant MAX_MULTIPLIER_SLIPPAGE_BPS = 100; // 1% tolerance

    // ─── Events ────────────────────────────────────────────────────────────────

    event BetPlaced(
        uint256 indexed betId,
        address indexed user,
        bytes32 indexed symbol,
        uint256 targetPrice,
        uint256 collateral,
        uint256 multiplier,
        Direction direction,
        uint256 expiry
    );
    event BetWon(
        uint256 indexed betId,
        address indexed user,
        address indexed settler,
        uint256 payout,
        uint256 settlerFee
    );
    event BetExpired(uint256 indexed betId, address indexed user);
    event SettlerFeeUpdated(uint256 newFeeBps);

    constructor(
        address _vault,
        address _priceAdapter,
        address _multiplierEngine,
        address _usdc
    ) Ownable(msg.sender) {
        require(_vault != address(0),           "TBM: zero vault");
        require(_priceAdapter != address(0),    "TBM: zero priceAdapter");
        require(_multiplierEngine != address(0),"TBM: zero multiplierEngine");
        require(_usdc != address(0),            "TBM: zero usdc");

        vault            = ITapVault(_vault);
        priceAdapter     = IPriceAdapter(_priceAdapter);
        multiplierEngine = IMultiplierEngine(_multiplierEngine);
        usdc             = IERC20(_usdc);
    }

    // ─── Owner controls ────────────────────────────────────────────────────────

    function setSettlerFeeBps(uint256 feeBps) external onlyOwner {
        require(feeBps <= 500, "TBM: fee too high");
        SETTLER_FEE_BPS = feeBps;
        emit SettlerFeeUpdated(feeBps);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── Place bet ─────────────────────────────────────────────────────────────

    /**
     * @notice Place a bet that `symbol` price will touch `targetPrice` before `expiry`.
     * @param symbol           keccak256 of asset string (e.g. keccak256("BTC"))
     * @param targetPrice      8-decimal target price
     * @param collateral       USDC amount (6 decimals); caller must have approved this contract
     * @param expiry           Unix timestamp of bet expiry (≤ now+3600)
     * @param expectedMultiplier  multiplier the UI showed the user (basis 100); validated ±1%
     */
    function placeBet(
        bytes32 symbol,
        uint256 targetPrice,
        uint256 collateral,
        uint256 expiry,
        uint256 expectedMultiplier
    ) external nonReentrant whenNotPaused returns (uint256 betId) {
        require(targetPrice > 0,                  "TBM: zero target price");
        require(collateral  > 0,                  "TBM: zero collateral");
        require(expiry > block.timestamp,         "TBM: expiry in past");
        require(expiry <= block.timestamp + 3600, "TBM: expiry too far");

        uint256 actualMultiplier = _validateAndGetMultiplier(
            symbol, targetPrice, expiry, expectedMultiplier
        );

        betId = _storeBet(symbol, targetPrice, collateral, expiry, actualMultiplier);

        // Pull collateral from user directly to vault, then notify vault
        usdc.safeTransferFrom(msg.sender, address(vault), collateral);
        vault.collectCollateral(collateral);

        emit BetPlaced(
            betId, msg.sender, symbol, targetPrice, collateral,
            actualMultiplier,
            targetPrice >= _cachedCurrentPrice(symbol) ? Direction.UP : Direction.DOWN,
            expiry
        );
    }

    function _cachedCurrentPrice(bytes32 symbol) internal view returns (uint256) {
        (uint256 p,) = priceAdapter.getLatestPrice(priceAdapter.priceIds(symbol));
        return p;
    }

    function _validateAndGetMultiplier(
        bytes32 symbol,
        uint256 targetPrice,
        uint256 expiry,
        uint256 expectedMultiplier
    ) internal view returns (uint256 actualMultiplier) {
        bytes32 priceId = priceAdapter.priceIds(symbol);
        require(priceId != bytes32(0), "TBM: unknown symbol");

        (uint256 currentPrice,) = priceAdapter.getLatestPrice(priceId);
        require(currentPrice > 0, "TBM: no price available");

        actualMultiplier = multiplierEngine.getMultiplier(
            currentPrice, targetPrice, expiry - block.timestamp
        );

        uint256 absDiff = actualMultiplier > expectedMultiplier
            ? actualMultiplier - expectedMultiplier
            : expectedMultiplier - actualMultiplier;
        require(
            absDiff * 10000 <= expectedMultiplier * MAX_MULTIPLIER_SLIPPAGE_BPS,
            "TBM: multiplier slippage exceeded"
        );
    }

    function _storeBet(
        bytes32 symbol,
        uint256 targetPrice,
        uint256 collateral,
        uint256 expiry,
        uint256 actualMultiplier
    ) internal returns (uint256 betId) {
        (uint256 currentPrice,) = priceAdapter.getLatestPrice(priceAdapter.priceIds(symbol));
        Direction direction = targetPrice >= currentPrice ? Direction.UP : Direction.DOWN;

        betId = nextBetId++;
        bets[betId] = Bet({
            betId:       betId,
            user:        msg.sender,
            symbol:      symbol,
            targetPrice: targetPrice,
            collateral:  collateral,
            multiplier:  actualMultiplier,
            direction:   direction,
            expiry:      expiry,
            status:      BetStatus.ACTIVE,
            placedAt:    block.timestamp
        });
        userBets[msg.sender].push(betId);
        activeBetIds.push(betId);
    }

    // ─── Settle win ────────────────────────────────────────────────────────────

    /**
     * @notice Permissionless settlement. Caller submits a Pyth proof; if the price has touched
     *         the target and the bet hasn't expired, caller earns SETTLER_FEE_BPS of the payout.
     * @param betId            ID of the bet to settle
     * @param priceUpdateData  Signed price update bytes[] from Pyth Hermes
     */
    function settleBetWin(
        uint256 betId,
        bytes[] calldata priceUpdateData
    ) external payable nonReentrant {
        Bet storage bet = bets[betId];
        require(bet.betId == betId && bet.user != address(0), "TBM: bet not found");
        require(bet.status == BetStatus.ACTIVE, "TBM: not active");
        require(block.timestamp <= bet.expiry,  "TBM: bet expired");

        bytes32 priceId = priceAdapter.priceIds(bet.symbol);
        (uint256 price,) = priceAdapter.verifyAndGetPrice{value: msg.value}(priceUpdateData, priceId);

        bool won = bet.direction == Direction.UP
            ? price >= bet.targetPrice
            : price <= bet.targetPrice;

        require(won, "TBM: win condition not met");

        bet.status = BetStatus.WON;
        _removeFromActive(betId);

        uint256 totalPayout  = (bet.collateral * bet.multiplier) / 100;
        uint256 settlerFee   = (totalPayout * SETTLER_FEE_BPS) / 10000;
        uint256 userPayout   = totalPayout - settlerFee;

        vault.payout(bet.user,    userPayout);
        vault.payout(msg.sender,  settlerFee);

        emit BetWon(betId, bet.user, msg.sender, userPayout, settlerFee);
    }

    // ─── Settle expired ────────────────────────────────────────────────────────

    /**
     * @notice Mark a single expired bet as EXPIRED. Collateral stays in vault (LP profit).
     */
    function settleExpired(uint256 betId) external {
        Bet storage bet = bets[betId];
        require(bet.user != address(0),          "TBM: bet not found");
        require(bet.status == BetStatus.ACTIVE,  "TBM: not active");
        require(block.timestamp > bet.expiry,    "TBM: not yet expired");

        bet.status = BetStatus.EXPIRED;
        _removeFromActive(betId);

        emit BetExpired(betId, bet.user);
    }

    /**
     * @notice Batch-settle expired bets. Skips ineligible entries rather than reverting.
     */
    function batchSettleExpired(uint256[] calldata betIds) external {
        for (uint256 i = 0; i < betIds.length; i++) {
            uint256 id = betIds[i];
            Bet storage bet = bets[id];
            if (bet.user == address(0)) continue;
            if (bet.status != BetStatus.ACTIVE) continue;
            if (block.timestamp <= bet.expiry) continue;

            bet.status = BetStatus.EXPIRED;
            _removeFromActive(id);

            emit BetExpired(id, bet.user);
        }
    }

    // ─── Views ─────────────────────────────────────────────────────────────────

    function getBet(uint256 betId) external view returns (Bet memory) {
        return bets[betId];
    }

    function getActiveBets() external view returns (uint256[] memory) {
        return activeBetIds;
    }

    function getUserBets(address user) external view returns (uint256[] memory) {
        return userBets[user];
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    function _removeFromActive(uint256 betId) internal {
        uint256 len = activeBetIds.length;
        for (uint256 i = 0; i < len; i++) {
            if (activeBetIds[i] == betId) {
                activeBetIds[i] = activeBetIds[len - 1];
                activeBetIds.pop();
                break;
            }
        }
    }

    receive() external payable {}
}
