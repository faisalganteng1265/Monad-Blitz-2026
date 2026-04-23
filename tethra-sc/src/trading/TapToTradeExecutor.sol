// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IRiskManagerTT {
    function validateTrade(address trader, string calldata symbol, uint256 leverage, uint256 collateral, bool isLong)
        external
        view
        returns (bool);
}

interface IPositionManagerTT {
    function createPosition(
        address trader,
        string calldata symbol,
        bool isLong,
        uint256 collateral,
        uint256 leverage,
        uint256 entryPrice
    ) external returns (uint256 positionId);
}

interface IStabilityFundTT {
    function settleTrade(address trader, uint256 collateral, int256 pnl, uint256 tradingFee, address relayer) external;
    function collectCollateral(address trader, uint256 amount) external;
}

/**
 * @title TapToTradeExecutor
 * @notice Eksekusi tap-to-trade cepat (market only) dengan opsi session key. Settlement dialirkan ke StabilityFund.
 */
contract TapToTradeExecutor is AccessControl, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant BACKEND_SIGNER_ROLE = keccak256("BACKEND_SIGNER_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 public constant PRICE_VALIDITY_WINDOW = 5 minutes;
    uint256 public constant MAX_SESSION_DURATION = 2 hours;

    IERC20 public immutable usdc;
    IRiskManagerTT public riskManager;
    IPositionManagerTT public positionManager;
    IStabilityFundTT public stabilityFund;

    uint256 public tradingFeeBps = 5; // 0.05% nominal (bps over 100000 in existing math)

    struct SignedPrice {
        string symbol;
        uint256 price;
        uint256 timestamp;
        bytes signature;
    }

    struct SessionKey {
        address keyAddress;
        uint256 expiresAt;
        bool isActive;
    }

    // trader => sessionKeyAddress => SessionKey
    mapping(address => mapping(address => SessionKey)) public sessionKeys;
    mapping(address => uint256) public metaNonces;

    event TapToTradeOrderExecuted(
        uint256 indexed positionId,
        address indexed trader,
        string symbol,
        bool isLong,
        uint256 collateral,
        uint256 leverage,
        uint256 price,
        address indexed signer
    );
    event SessionKeyAuthorized(address indexed trader, address indexed sessionKey, uint256 expiresAt);
    event SessionKeyRevoked(address indexed trader, address indexed sessionKey);
    event MetaTransactionExecuted(address indexed userAddress, address indexed relayerAddress, uint256 nonce);
    event FeesUpdated(uint256 tradingFeeBps);

    constructor(
        address _usdc,
        address _riskManager,
        address _positionManager,
        address _stabilityFund,
        address _backendSigner
    ) {
        require(_usdc != address(0), "TapToTradeExecutor: invalid USDC");
        require(_riskManager != address(0), "TapToTradeExecutor: invalid RiskManager");
        require(_positionManager != address(0), "TapToTradeExecutor: invalid PositionManager");
        require(_stabilityFund != address(0), "TapToTradeExecutor: invalid StabilityFund");
        require(_backendSigner != address(0), "TapToTradeExecutor: invalid signer");

        usdc = IERC20(_usdc);
        riskManager = IRiskManagerTT(_riskManager);
        positionManager = IPositionManagerTT(_positionManager);
        stabilityFund = IStabilityFundTT(_stabilityFund);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BACKEND_SIGNER_ROLE, _backendSigner);
    }

    function authorizeSessionKey(
        address sessionKeyAddress,
        uint256 duration,
        bytes calldata /* authSignature */
    )
        external
        nonReentrant
    {
        require(sessionKeyAddress != address(0), "TapToTradeExecutor: invalid key");
        require(duration > 0 && duration <= MAX_SESSION_DURATION, "TapToTradeExecutor: invalid duration");

        sessionKeys[msg.sender][sessionKeyAddress] =
            SessionKey({keyAddress: sessionKeyAddress, expiresAt: block.timestamp + duration, isActive: true});

        emit SessionKeyAuthorized(msg.sender, sessionKeyAddress, block.timestamp + duration);
    }

    function revokeSessionKey(address sessionKeyAddress) external nonReentrant {
        SessionKey storage sk = sessionKeys[msg.sender][sessionKeyAddress];
        require(sk.isActive, "TapToTradeExecutor: not active");
        sk.isActive = false;
        emit SessionKeyRevoked(msg.sender, sessionKeyAddress);
    }

    function isSessionKeyValid(address trader, address sessionKeyAddress) public view returns (bool) {
        SessionKey memory sk = sessionKeys[trader][sessionKeyAddress];
        return sk.isActive && sk.expiresAt >= block.timestamp && sk.keyAddress == sessionKeyAddress;
    }

    function executeTapToTrade(
        address trader,
        string calldata symbol,
        bool isLong,
        uint256 collateral,
        uint256 leverage,
        SignedPrice calldata signedPrice,
        bytes calldata userSignature
    ) external nonReentrant returns (uint256 positionId) {
        // validate signature: either trader or authorized session key
        bytes32 messageHash = keccak256(
            abi.encodePacked(trader, symbol, isLong, collateral, leverage, metaNonces[trader], address(this))
        );
        address signer = messageHash.toEthSignedMessageHash().recover(userSignature);
        require(
            signer == trader || isSessionKeyValid(trader, signer),
            "TapToTradeExecutor: invalid user or session signature"
        );

        metaNonces[trader]++;
        _verifySignedPrice(signedPrice);
        _validateTrade(trader, symbol, leverage, collateral, isLong);

        stabilityFund.collectCollateral(trader, collateral);

        positionId = positionManager.createPosition(trader, symbol, isLong, collateral, leverage, signedPrice.price);

        emit MetaTransactionExecuted(trader, msg.sender, metaNonces[trader] - 1);
        emit TapToTradeOrderExecuted(
            positionId, trader, symbol, isLong, collateral, leverage, signedPrice.price, signer
        );
    }

    function executeTapToTradeByKeeper(
        address trader,
        string calldata symbol,
        bool isLong,
        uint256 collateral,
        uint256 leverage,
        SignedPrice calldata signedPrice
    ) external onlyRole(KEEPER_ROLE) nonReentrant returns (uint256 positionId) {
        _verifySignedPrice(signedPrice);
        _validateTrade(trader, symbol, leverage, collateral, isLong);

        stabilityFund.collectCollateral(trader, collateral);
        positionId = positionManager.createPosition(trader, symbol, isLong, collateral, leverage, signedPrice.price);

        emit TapToTradeOrderExecuted(
            positionId, trader, symbol, isLong, collateral, leverage, signedPrice.price, msg.sender
        );
    }

    function updateRiskManager(address _riskManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_riskManager != address(0), "TapToTradeExecutor: invalid risk manager");
        riskManager = IRiskManagerTT(_riskManager);
    }

    function updateFees(uint256 _tradingFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tradingFeeBps <= 100, "TapToTradeExecutor: fee too high");
        tradingFeeBps = _tradingFeeBps;
        emit FeesUpdated(_tradingFeeBps);
    }

    function _validateTrade(address trader, string calldata symbol, uint256 leverage, uint256 collateral, bool isLong)
        internal
        view
    {
        require(
            riskManager.validateTrade(trader, symbol, leverage, collateral, isLong),
            "TapToTradeExecutor: validation failed"
        );
    }

    function _verifySignedPrice(SignedPrice calldata signedPrice) internal view {
        require(block.timestamp <= signedPrice.timestamp + PRICE_VALIDITY_WINDOW, "TapToTradeExecutor: price expired");
        require(signedPrice.timestamp <= block.timestamp, "TapToTradeExecutor: timestamp in future");
        bytes32 messageHash = keccak256(abi.encodePacked(signedPrice.symbol, signedPrice.price, signedPrice.timestamp));
        address signer = messageHash.toEthSignedMessageHash().recover(signedPrice.signature);
        require(hasRole(BACKEND_SIGNER_ROLE, signer), "TapToTradeExecutor: invalid price signer");
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
