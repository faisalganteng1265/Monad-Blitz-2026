// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title VaultPool
 * @notice Pool LP tanpa lock untuk USDC. Menerbitkan share, menerima kerugian/fee settlement, dan bisa membayar trader jika buffer kurang.
 */
contract VaultPool is ERC20, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE"); // StabilityFund/relayer

    IERC20 public immutable usdc;
    uint256 public immutable deployedAt = block.timestamp;
    // USDC uses 6 decimals, while this vault share token uses 18 decimals (ERC20 default).
    // SCALE normalizes between the two so share math keeps 1:1 with assets on the first deposit.
    uint256 private constant ASSET_DECIMALS = 6;
    uint256 private constant SCALE = 10 ** (18 - ASSET_DECIMALS);
    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    // Virtual supply anchors pricing when assets exist but no shares minted (e.g., pre-seeded funds).
    uint256 public virtualSupply;

    uint256 public lockPeriod = 7 days;
    uint256 public earlyExitFeeBps = 50; // 0.5% default

    // Yield tracking from external settlements/fees
    uint256 public totalYieldAccrued;
    uint256 public apyEstimateBps = 1200; // default 12% displayed until real inflows observed
    uint256 public lastYieldAt;

    mapping(address => uint256) public lastDepositAt;

    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 assets, uint256 shares);
    event PaidOut(address indexed to, uint256 amount);
    event SettlementReceived(uint256 amount);
    event LockPeriodUpdated(uint256 newLockPeriod);
    event EarlyExitFeeUpdated(uint256 newFeeBps);
    event YieldRecorded(uint256 amount, uint256 apyEstimateBps);

    constructor(address _usdc) ERC20("Tethra Vault Share", "TVS") {
        require(_usdc != address(0), "VaultPool: invalid USDC");
        usdc = IERC20(_usdc);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SETTLER_ROLE, msg.sender);
    }

    function totalAssets() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function _pricingSupply() internal view returns (uint256) {
        uint256 supply = totalSupply();
        return supply + virtualSupply;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = _pricingSupply();
        if (supply == 0) {
            // scale up to 18 decimals so the first depositor gets 1:1 pricing vs USDC
            return assets * SCALE;
        }
        return (assets * supply) / totalAssets();
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = _pricingSupply();
        if (supply == 0) {
            // inverse of the SCALE adjustment in convertToShares
            return shares / SCALE;
        }
        return (shares * totalAssets()) / supply;
    }

    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        require(assets > 0, "VaultPool: zero assets");

        // If vault already has assets but no supply, anchor pricing with virtual supply
        if (totalSupply() == 0 && virtualSupply == 0) {
            uint256 backing = totalAssets();
            if (backing > 0) {
                virtualSupply = backing * SCALE;
            }
        }

        shares = convertToShares(assets);
        require(shares > 0, "VaultPool: zero shares");

        usdc.safeTransferFrom(msg.sender, address(this), assets);
        _mint(msg.sender, shares);
        lastDepositAt[msg.sender] = block.timestamp;

        emit Deposited(msg.sender, assets, shares);
    }

    function withdraw(uint256 shares) external nonReentrant returns (uint256 assets) {
        require(shares > 0, "VaultPool: zero shares");
        require(balanceOf(msg.sender) >= shares, "VaultPool: insufficient shares");

        assets = convertToAssets(shares);
        uint256 fee;
        uint256 depositTime = lastDepositAt[msg.sender];

        // If user has never deposited (edge case), treat as unlocked for backward compatibility
        bool early = depositTime != 0 && block.timestamp < depositTime + lockPeriod;
        if (early && earlyExitFeeBps > 0) {
            fee = (assets * earlyExitFeeBps) / BPS_DENOMINATOR;
            assets -= fee;
            require(assets > 0, "VaultPool: zero assets after fee");
            // fee stays in vault, benefiting remaining LPs
        }

        _burn(msg.sender, shares);
        usdc.safeTransfer(msg.sender, assets);

        emit Withdrawn(msg.sender, assets, shares);
    }

    /**
     * @notice Dipanggil StabilityFund untuk membayar trader saat buffer kurang.
     */
    function coverPayout(address to, uint256 amount) external onlyRole(SETTLER_ROLE) nonReentrant {
        require(to != address(0), "VaultPool: invalid receiver");
        require(amount > 0, "VaultPool: zero amount");
        require(usdc.balanceOf(address(this)) >= amount, "VaultPool: insufficient liquidity");

        usdc.safeTransfer(to, amount);
        emit PaidOut(to, amount);
    }

    /**
     * @notice Menerima hasil settlement (kerugian + fee) tanpa mint share.
     */
    function receiveFromSettlement(uint256 amount) external onlyRole(SETTLER_ROLE) {
        require(amount > 0, "VaultPool: zero amount");
        // Require funds already transferred in by caller
        require(usdc.balanceOf(address(this)) >= amount, "VaultPool: missing funds");

        uint256 beforeAssets = totalAssets() - amount;
        uint256 effectiveLast = lastYieldAt == 0 ? deployedAt : lastYieldAt;
        uint256 elapsed = block.timestamp > effectiveLast ? block.timestamp - effectiveLast : 1;

        if (beforeAssets > 0 && elapsed > 0) {
            // annualized simple APY estimate from this inflow (bps)
            uint256 instantApyBps = (amount * SECONDS_PER_YEAR * BPS_DENOMINATOR) / (beforeAssets * elapsed);
            if (lastYieldAt == 0) {
                apyEstimateBps = instantApyBps;
            } else {
                // smooth with simple EMA (3/4 previous, 1/4 new)
                apyEstimateBps = (apyEstimateBps * 3 + instantApyBps) / 4;
            }
        } else if (apyEstimateBps == 0) {
            // initialize fallback if no backing
            apyEstimateBps = (amount * BPS_DENOMINATOR) / (beforeAssets == 0 ? amount : beforeAssets);
        }

        totalYieldAccrued += amount;
        lastYieldAt = block.timestamp;

        emit SettlementReceived(amount);
        emit YieldRecorded(amount, apyEstimateBps);
    }

    function grantSettler(address settler) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(SETTLER_ROLE, settler);
    }

    function revokeSettler(address settler) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(SETTLER_ROLE, settler);
    }

    function updateLockPeriod(uint256 newLockPeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newLockPeriod <= 30 days, "VaultPool: lock too long");
        require(newLockPeriod >= 1 days, "VaultPool: lock too short");
        lockPeriod = newLockPeriod;
        emit LockPeriodUpdated(newLockPeriod);
    }

    function updateEarlyExitFee(uint256 newFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFeeBps <= 1000, "VaultPool: fee too high"); // cap 10%
        earlyExitFeeBps = newFeeBps;
        emit EarlyExitFeeUpdated(newFeeBps);
    }

    function updateApyEstimate(uint256 newBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newBps <= 50_000, "VaultPool: APY too high");
        apyEstimateBps = newBps;
        emit YieldRecorded(0, newBps);
    }

    function unlockTime(address user) external view returns (uint256) {
        uint256 ts = lastDepositAt[user];
        if (ts == 0) return 0;
        return ts + lockPeriod;
    }

    function isUnlocked(address user) external view returns (bool) {
        uint256 ts = lastDepositAt[user];
        if (ts == 0) return true;
        return block.timestamp >= ts + lockPeriod;
    }
}
