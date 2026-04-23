// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IStabilityFundOTP {
    function settleTrade(address trader, uint256 collateral, int256 pnl, uint256 tradingFee, address relayer) external;
    function collectCollateral(address trader, uint256 amount) external;
}

/// @notice Chainlink CRE Keystone receiver interface
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/**
 * @title OneTapProfit
 * @notice Binary option-style trading where users bet on price reaching specific grid targets
 * @dev Users click grid targets, pay USDC, win if price reaches target within time window
 */
contract OneTapProfit is AccessControl, ReentrancyGuard, IReceiver {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant BACKEND_SIGNER_ROLE = keccak256("BACKEND_SIGNER_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    IERC20 public immutable usdc;
    IStabilityFundOTP public stabilityFund;

    // Constants
    uint256 public constant MIN_TIME_OFFSET = 10; // Minimum 10 seconds from current time
    uint256 public constant GRID_DURATION = 10; // Each grid = 10 seconds
    uint256 public constant BASE_MULTIPLIER = 110; // 1.1x base (110 = 1.10x in basis of 100)
    uint256 public constant TRADING_FEE_BPS = 5; // 0.05% trading fee
    uint256 public constant PRICE_DECIMALS = 8; // Pyth price has 8 decimals

    // Bet tracking
    uint256 public nextBetId;
    mapping(uint256 => Bet) public bets;
    mapping(address => uint256[]) public userBets;

    // Meta-transaction nonces for gasless transactions
    mapping(address => uint256) public metaNonces;

    enum BetStatus {
        ACTIVE, // Bet is active, waiting for target or expiry
        WON, // Target reached, user won
        LOST, // Expired without reaching target
        CANCELLED // Cancelled by admin
    }

    struct Bet {
        uint256 betId;
        address trader;
        string symbol; // e.g., "BTC", "ETH"
        uint256 betAmount; // USDC amount (6 decimals)
        uint256 targetPrice; // Target price (8 decimals)
        uint256 targetTime; // Target timestamp
        uint256 entryPrice; // Price when bet was placed (8 decimals)
        uint256 entryTime; // Timestamp when bet was placed
        uint256 multiplier; // Payout multiplier (basis 100, e.g., 110 = 1.1x)
        BetStatus status;
        uint256 settledAt; // When bet was settled
        uint256 settlePrice; // Price at settlement
    }

    // Events
    event BetPlaced(
        uint256 indexed betId,
        address indexed trader,
        string symbol,
        uint256 betAmount,
        uint256 targetPrice,
        uint256 targetTime,
        uint256 entryPrice,
        uint256 multiplier
    );

    event BetSettled(
        uint256 indexed betId,
        address indexed trader,
        BetStatus status,
        uint256 payout,
        uint256 fee,
        uint256 settlePrice
    );

    event MetaTransactionExecuted(address indexed userAddress, address indexed relayerAddress, uint256 nonce);
    event KeeperExecutionSuccess(address indexed keeper, address indexed trader, uint256 betId);

    constructor(address _usdc, address _stabilityFund, address _backendSigner, address _keeper, address _settler) {
        require(_usdc != address(0), "OneTapProfit: Invalid USDC");
        require(_stabilityFund != address(0), "OneTapProfit: Invalid StabilityFund");
        require(_backendSigner != address(0), "OneTapProfit: Invalid signer");
        require(_keeper != address(0), "OneTapProfit: Invalid keeper");
        require(_settler != address(0), "OneTapProfit: Invalid settler");

        usdc = IERC20(_usdc);
        stabilityFund = IStabilityFundOTP(_stabilityFund);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BACKEND_SIGNER_ROLE, _backendSigner);
        _grantRole(KEEPER_ROLE, _keeper);
        _grantRole(SETTLER_ROLE, _settler);
    }

    /**
     * @notice Calculate multiplier based on distance and time
     * @param entryPrice Current price when bet is placed
     * @param targetPrice Target price user is betting on
     * @param entryTime Current time when bet is placed
     * @param targetTime Target time user is betting on
     * @return multiplier Payout multiplier (basis 100, e.g., 150 = 1.5x)
     */
    function calculateMultiplier(uint256 entryPrice, uint256 targetPrice, uint256 entryTime, uint256 targetTime)
        public
        pure
        returns (uint256)
    {
        // Calculate price distance percentage (in basis points)
        uint256 priceDistance;
        if (targetPrice > entryPrice) {
            priceDistance = ((targetPrice - entryPrice) * 10000) / entryPrice;
        } else {
            priceDistance = ((entryPrice - targetPrice) * 10000) / entryPrice;
        }

        // Calculate time distance in seconds
        uint256 timeDistance = targetTime > entryTime ? targetTime - entryTime : 0;

        // Combined distance factor: price (60%) + time (40%)
        // Each 1% price distance adds 0.02x (2 points)
        // Each 10 seconds adds 0.01x (1 point)
        uint256 priceComponent = (priceDistance * 60) / 10000; // 0.6% per 1% price distance
        uint256 timeComponent = (timeDistance * 40) / (10 * 100); // 0.4% per 10 seconds

        // Multiplier = BASE_MULTIPLIER + combined distance
        // Minimum 1.1x, scales up with distance
        uint256 multiplier = BASE_MULTIPLIER + priceComponent + timeComponent;

        // Cap maximum multiplier at 10x (1000 points)
        if (multiplier > 1000) {
            multiplier = 1000;
        }

        return multiplier;
    }

    /**
     * @notice Place a bet via meta-transaction (gasless)
     * @param trader The actual trader address (from AA wallet)
     * @param symbol Asset symbol (e.g., "BTC", "ETH")
     * @param betAmount USDC amount to bet (6 decimals)
     * @param targetPrice Target price user bets on (8 decimals)
     * @param targetTime Target time user bets on (Unix timestamp)
     * @param entryPrice Current price when bet is placed (8 decimals)
     * @param entryTime Current time when bet is placed (Unix timestamp)
     * @param userSignature Signature from trader approving this bet
     */
    function placeBetMeta(
        address trader,
        string calldata symbol,
        uint256 betAmount,
        uint256 targetPrice,
        uint256 targetTime,
        uint256 entryPrice,
        uint256 entryTime,
        bytes calldata userSignature,
        uint256 multiplier
    ) external nonReentrant returns (uint256 betId) {
        // Verify user signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(trader, symbol, betAmount, targetPrice, targetTime, metaNonces[trader], address(this))
        );

        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedMessageHash.recover(userSignature);

        require(signer == trader, "OneTapProfit: Invalid user signature");

        // Increment nonce to prevent replay
        metaNonces[trader]++;

        // Validate bet parameters
        require(betAmount > 0, "OneTapProfit: Invalid bet amount");
        require(targetPrice > 0, "OneTapProfit: Invalid target price");
        require(entryPrice > 0, "OneTapProfit: Invalid entry price");
        require(targetTime > entryTime, "OneTapProfit: Target time must be future");
        require(targetTime >= entryTime + MIN_TIME_OFFSET, "OneTapProfit: Target too close");
        require(multiplier >= 100 && multiplier <= 2000, "OneTapProfit: Invalid multiplier");

        // Transfer USDC from trader to stability fund (single approval target)
        stabilityFund.collectCollateral(trader, betAmount);

        // Create bet
        betId = nextBetId++;
        bets[betId] = Bet({
            betId: betId,
            trader: trader,
            symbol: symbol,
            betAmount: betAmount,
            targetPrice: targetPrice,
            targetTime: targetTime,
            entryPrice: entryPrice,
            entryTime: entryTime,
            multiplier: multiplier,
            status: BetStatus.ACTIVE,
            settledAt: 0,
            settlePrice: 0
        });

        userBets[trader].push(betId);

        emit MetaTransactionExecuted(trader, msg.sender, metaNonces[trader] - 1);
        emit BetPlaced(betId, trader, symbol, betAmount, targetPrice, targetTime, entryPrice, multiplier);

        return betId;
    }

    /**
     * @notice Place a bet via keeper (fully gasless for user)
     * @dev Backend validates session key signature off-chain, keeper executes without signature verification
     * @param trader The actual trader address
     * @param symbol Asset symbol (e.g., "BTC", "ETH")
     * @param betAmount USDC amount to bet (6 decimals)
     * @param targetPrice Target price user bets on (8 decimals)
     * @param targetTime Target time user bets on (Unix timestamp)
     * @param entryPrice Current price when bet is placed (8 decimals)
     * @param entryTime Current time when bet is placed (Unix timestamp)
     */
    function placeBetByKeeper(
        address trader,
        string calldata symbol,
        uint256 betAmount,
        uint256 targetPrice,
        uint256 targetTime,
        uint256 entryPrice,
        uint256 entryTime,
        uint256 multiplier
    ) external onlyRole(KEEPER_ROLE) nonReentrant returns (uint256 betId) {
        // Validate bet parameters
        require(betAmount > 0, "OneTapProfit: Invalid bet amount");
        require(targetPrice > 0, "OneTapProfit: Invalid target price");
        require(entryPrice > 0, "OneTapProfit: Invalid entry price");
        require(targetTime > entryTime, "OneTapProfit: Target time must be future");
        require(targetTime >= entryTime + MIN_TIME_OFFSET, "OneTapProfit: Target too close");
        require(multiplier >= 100 && multiplier <= 2000, "OneTapProfit: Invalid multiplier");

        // Transfer USDC from trader to stability fund (keeper pays gas, not trader)
        stabilityFund.collectCollateral(trader, betAmount);

        // Create bet
        betId = nextBetId++;
        bets[betId] = Bet({
            betId: betId,
            trader: trader,
            symbol: symbol,
            betAmount: betAmount,
            targetPrice: targetPrice,
            targetTime: targetTime,
            entryPrice: entryPrice,
            entryTime: entryTime,
            multiplier: multiplier,
            status: BetStatus.ACTIVE,
            settledAt: 0,
            settlePrice: 0
        });

        userBets[trader].push(betId);

        emit KeeperExecutionSuccess(msg.sender, trader, betId);
        emit BetPlaced(betId, trader, symbol, betAmount, targetPrice, targetTime, entryPrice, multiplier);

        return betId;
    }

    /**
     * @notice Settle a bet (called by backend settler)
     * @param betId Bet ID to settle
     * @param currentPrice Current price at settlement (8 decimals)
     * @param currentTime Current time at settlement (Unix timestamp)
     * @param won Whether the bet won (target reached before/at target time)
     */
    function settleBet(uint256 betId, uint256 currentPrice, uint256 currentTime, bool won)
        external
        onlyRole(SETTLER_ROLE)
        nonReentrant
    {
        Bet storage bet = bets[betId];

        require(bet.status == BetStatus.ACTIVE, "OneTapProfit: Bet not active");
        require(currentPrice > 0, "OneTapProfit: Invalid current price");

        // Update bet status
        bet.status = won ? BetStatus.WON : BetStatus.LOST;
        bet.settledAt = currentTime;
        bet.settlePrice = currentPrice;

        uint256 payout = 0;
        uint256 fee = 0;

        if (won) {
            payout = (bet.betAmount * bet.multiplier) / 100;
            fee = (payout * TRADING_FEE_BPS) / 100000;
            int256 pnl = int256(payout) - int256(bet.betAmount);
            stabilityFund.settleTrade(bet.trader, bet.betAmount, pnl, fee, msg.sender);
        } else {
            // loss: trader loses betAmount, fee=0, buffer keeps collateral
            stabilityFund.settleTrade(bet.trader, bet.betAmount, -int256(bet.betAmount), 0, msg.sender);
        }

        emit BetSettled(betId, bet.trader, bet.status, payout, fee, currentPrice);
    }

    /**
     * @notice Get bet details
     * @param betId Bet ID
     */
    function getBet(uint256 betId)
        external
        view
        returns (
            uint256 id,
            address trader,
            string memory symbol,
            uint256 betAmount,
            uint256 targetPrice,
            uint256 targetTime,
            uint256 entryPrice,
            uint256 entryTime,
            uint256 multiplier,
            BetStatus status,
            uint256 settledAt,
            uint256 settlePrice
        )
    {
        Bet memory bet = bets[betId];
        return (
            bet.betId,
            bet.trader,
            bet.symbol,
            bet.betAmount,
            bet.targetPrice,
            bet.targetTime,
            bet.entryPrice,
            bet.entryTime,
            bet.multiplier,
            bet.status,
            bet.settledAt,
            bet.settlePrice
        );
    }

    /**
     * @notice Get user's bet IDs
     * @param user User address
     */
    function getUserBets(address user) external view returns (uint256[] memory) {
        return userBets[user];
    }

    /**
     * @notice Get active bets count
     */
    function getActiveBetsCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < nextBetId; i++) {
            if (bets[i].status == BetStatus.ACTIVE) {
                count++;
            }
        }
        return count;
    }

    /**
     * @notice Update stability fund (admin only)
     */
    function updateStabilityFund(address _stabilityFund) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_stabilityFund != address(0), "OneTapProfit: Invalid address");
        stabilityFund = IStabilityFundOTP(_stabilityFund);
    }

    /**
     * @notice Cancel a bet (admin only, for emergencies)
     * @param betId Bet ID to cancel
     */
    function cancelBet(uint256 betId) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        Bet storage bet = bets[betId];

        require(bet.status == BetStatus.ACTIVE, "OneTapProfit: Bet not active");

        bet.status = BetStatus.CANCELLED;

        // Refund bet amount to trader
        stabilityFund.settleTrade(bet.trader, bet.betAmount, 0, 0, msg.sender);

        emit BetSettled(betId, bet.trader, BetStatus.CANCELLED, 0, 0, 0);
    }

    // ============================================================
    // PRIVATE BET — Chainlink CRE Integration
    // ============================================================

    struct PrivateBet {
        uint256 betId;
        // TIDAK ada field `trader` — tersembunyi dalam commitment
        string symbol;
        uint256 targetTime;
        uint256 collateral;   // denomination: 5/10/50/100 USDC (6 decimals)
        uint256 multiplier;   // basis 100, dihitung backend saat placement
        bytes32 commitment;   // keccak256(trader, betAmount, targetPrice, isUp, secret)
        BetStatus status;     // reuse existing BetStatus enum
        uint256 settledAt;
        uint256 settlePrice;
    }

    mapping(uint256 => PrivateBet) public privateBets;
    uint256 public nextPrivateBetId;

    // Valid denominations (6 decimals USDC)
    uint256[4] public DENOMINATIONS = [5e6, 10e6, 50e6, 100e6];

    // Role baru — HANYA CRE yang bisa settle private bets
    bytes32 public constant CRE_SETTLER_ROLE = keccak256("CRE_SETTLER_ROLE");

    event PrivateBetPlaced(
        uint256 indexed betId,
        string symbol,
        uint256 targetTime,
        uint256 collateral,
        bytes32 commitment
        // SENGAJA tidak ada trader address
    );

    event BatchSettled(
        uint256 count,
        address indexed settler,
        bytes attestation
    );

    /// @notice Place private bet — dipanggil relay wallet (KEEPER_ROLE)
    /// @dev USDC flow: user sudah transfer USDC ke relay wallet sebelumnya.
    ///      collectCollateral narik dari msg.sender (relay wallet), bukan user.
    ///      Relay wallet harus sudah approve(stabilityFund, max) sekali di awal.
    function placeBetPrivate(
        bytes32 commitment,
        string calldata symbol,
        uint256 targetTime,
        uint256 collateral,
        uint256 multiplier
    ) external onlyRole(KEEPER_ROLE) nonReentrant returns (uint256 betId) {
        require(_isValidDenomination(collateral), "OneTapProfit: Invalid denomination");
        require(targetTime > block.timestamp + MIN_TIME_OFFSET, "OneTapProfit: Target too soon");
        require(bytes(symbol).length > 0, "OneTapProfit: Invalid symbol");
        require(multiplier >= 100 && multiplier <= 2000, "OneTapProfit: Invalid multiplier");

        // Narik USDC dari relay wallet (msg.sender), bukan dari user langsung
        stabilityFund.collectCollateral(msg.sender, collateral);

        betId = nextPrivateBetId++;
        privateBets[betId] = PrivateBet({
            betId: betId,
            symbol: symbol,
            targetTime: targetTime,
            collateral: collateral,
            multiplier: multiplier,
            commitment: commitment,
            status: BetStatus.ACTIVE,
            settledAt: 0,
            settlePrice: 0
        });

        emit PrivateBetPlaced(betId, symbol, targetTime, collateral, commitment);
    }

    function _isValidDenomination(uint256 amount) internal view returns (bool) {
        for (uint256 i = 0; i < DENOMINATIONS.length; i++) {
            if (DENOMINATIONS[i] == amount) return true;
        }
        return false;
    }

    /// @notice Batch settle private bets — HANYA dipanggil CRE (CRE_SETTLER_ROLE)
    /// @dev traders[] berisi address asli dari encrypted data yang di-decrypt di TEE.
    function settleBetBatch(
        uint256[] calldata betIds,
        address[] calldata traders,
        uint256[] calldata settlePrices,
        bool[] calldata wonArr,
        bytes calldata creAttestation
    ) external onlyRole(CRE_SETTLER_ROLE) nonReentrant {
        require(betIds.length == traders.length, "Length mismatch");
        require(betIds.length == settlePrices.length, "Length mismatch");
        require(betIds.length == wonArr.length, "Length mismatch");

        for (uint256 i = 0; i < betIds.length; i++) {
            _settlePrivateBet(betIds[i], traders[i], settlePrices[i], wonArr[i]);
        }

        emit BatchSettled(betIds.length, msg.sender, creAttestation);
    }

    /// @notice Chainlink CRE Keystone receiver — receives signed reports from writeReport
    /// @dev The report payload is ABI-encoded (betIds, traders, settlePrices, wonArr)
    function onReport(bytes calldata /* metadata */, bytes calldata report) external {
        require(
            hasRole(CRE_SETTLER_ROLE, msg.sender),
            "OneTapProfit: caller not CRE settler"
        );

        (
            uint256[] memory _betIds,
            address[] memory _traders,
            uint256[] memory _settlePrices,
            bool[] memory _wonArr
        ) = abi.decode(report, (uint256[], address[], uint256[], bool[]));

        require(_betIds.length == _traders.length, "Length mismatch");
        require(_betIds.length == _settlePrices.length, "Length mismatch");
        require(_betIds.length == _wonArr.length, "Length mismatch");

        for (uint256 i = 0; i < _betIds.length; i++) {
            _settlePrivateBet(_betIds[i], _traders[i], _settlePrices[i], _wonArr[i]);
        }

        emit BatchSettled(_betIds.length, msg.sender, "");
    }

    /// @notice ERC165 supportsInterface for IReceiver
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return interfaceId == type(IReceiver).interfaceId || super.supportsInterface(interfaceId);
    }

    function _settlePrivateBet(
        uint256 betId,
        address trader,
        uint256 settlePrice,
        bool won
    ) internal {
        PrivateBet storage bet = privateBets[betId];
        require(bet.status == BetStatus.ACTIVE, "OneTapProfit: Not active");

        bet.status = won ? BetStatus.WON : BetStatus.LOST;
        bet.settledAt = block.timestamp;
        bet.settlePrice = settlePrice;

        if (won) {
            uint256 payout = (bet.collateral * bet.multiplier) / 100;
            uint256 fee = (payout * TRADING_FEE_BPS) / 100000;
            int256 pnl = int256(payout) - int256(bet.collateral);
            stabilityFund.settleTrade(trader, bet.collateral, pnl, fee, msg.sender);
        } else {
            stabilityFund.settleTrade(trader, bet.collateral, -int256(bet.collateral), 0, msg.sender);
        }
    }
}
