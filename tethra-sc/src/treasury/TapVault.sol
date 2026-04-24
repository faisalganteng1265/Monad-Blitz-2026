// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TapVault
 * @notice LP vault for TapX. Holds USDC liquidity, issues ERC-20 shares, pays out winners.
 * @dev Deposit/withdraw are permissionless. Only betManager can collectCollateral and payout.
 */
contract TapVault is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    // USDC is 6 decimals; shares are 18 decimals. SCALE bridges the gap so first depositor gets 1:1.
    uint256 private constant SCALE = 10 ** 12;

    address public betManager;

    event BetManagerSet(address indexed betManager);
    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 assets, uint256 shares);
    event CollateralCollected(uint256 amount);
    event PayoutIssued(address indexed to, uint256 amount);

    modifier onlyBetManager() {
        require(msg.sender == betManager, "TapVault: not betManager");
        _;
    }

    constructor(address _usdc) ERC20("TapX Vault Share", "TVS") Ownable(msg.sender) {
        require(_usdc != address(0), "TapVault: zero usdc");
        usdc = IERC20(_usdc);
    }

    // ─────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────

    function setBetManager(address _betManager) external onlyOwner {
        require(_betManager != address(0), "TapVault: zero address");
        betManager = _betManager;
        emit BetManagerSet(_betManager);
    }

    // ─────────────────────────────────────────
    // Share pricing
    // ─────────────────────────────────────────

    function totalAssets() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return assets * SCALE;
        return (assets * supply) / totalAssets();
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return shares / SCALE;
        return (shares * totalAssets()) / supply;
    }

    // ─────────────────────────────────────────
    // LP deposit / withdraw
    // ─────────────────────────────────────────

    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        require(assets > 0, "TapVault: zero assets");
        shares = convertToShares(assets);
        require(shares > 0, "TapVault: zero shares");
        usdc.safeTransferFrom(msg.sender, address(this), assets);
        _mint(msg.sender, shares);
        emit Deposited(msg.sender, assets, shares);
    }

    function withdraw(uint256 shares) external nonReentrant returns (uint256 assets) {
        require(shares > 0, "TapVault: zero shares");
        require(balanceOf(msg.sender) >= shares, "TapVault: insufficient shares");
        assets = convertToAssets(shares);
        require(assets > 0, "TapVault: zero assets");
        _burn(msg.sender, shares);
        usdc.safeTransfer(msg.sender, assets);
        emit Withdrawn(msg.sender, assets, shares);
    }

    // ─────────────────────────────────────────
    // BetManager interface
    // ─────────────────────────────────────────

    /**
     * @notice Called by BetManager after it has already transferred collateral into this vault.
     *         Emits CollateralCollected for accounting; the actual USDC arrives via transferFrom in BetManager.
     */
    function collectCollateral(uint256 amount) external onlyBetManager {
        require(amount > 0, "TapVault: zero amount");
        emit CollateralCollected(amount);
    }

    /**
     * @notice Pay out a winner. Reverts if vault has insufficient USDC.
     */
    function payout(address to, uint256 amount) external onlyBetManager nonReentrant {
        require(to != address(0), "TapVault: zero recipient");
        require(amount > 0, "TapVault: zero amount");
        require(usdc.balanceOf(address(this)) >= amount, "TapVault: insufficient liquidity");
        usdc.safeTransfer(to, amount);
        emit PayoutIssued(to, amount);
    }

    /**
     * @notice Pre-flight check before issuing a payout.
     */
    function canCoverPayout(uint256 amount) external view returns (bool) {
        return usdc.balanceOf(address(this)) >= amount;
    }
}
