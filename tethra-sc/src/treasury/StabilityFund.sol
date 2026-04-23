// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IVaultPool {
    function coverPayout(address to, uint256 amount) external;
    function receiveFromSettlement(uint256 amount) external;
}

/**
 * @title StabilityFund
 * @notice Buffer contract yang menyerap kerugian lebih dulu dan membayar profit trader sebelum VaultPool.
 *         Fee trading dibagi: relayer (opsional), team, dan buffer. Surplus buffer bisa di-stream ke VaultPool.
 */
contract StabilityFund is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    bytes32 public constant STREAMER_ROLE = keccak256("STREAMER_ROLE");

    IERC20 public immutable usdc;
    IVaultPool public vaultPool;

    address public teamWallet;

    // fee split basis points terhadap total trading fee (harus = 10000)
    uint256 public feeToRelayerBps = 0; // diagram tidak pakai relayer fee, default 0
    uint256 public feeToTeamBps = 2500; // 25% dari fee (0.01% dari total 0.04% jika fee total 0.04)
    uint256 public feeToBufferBps = 7500; // 75% dari fee (0.03% dari total 0.04% jika fee total 0.04)

    // streaming buffer ke pool
    uint256 public streamInterval = 30 minutes;
    uint256 public lastStreamAt;
    uint256 public streamPortionBps = 10000; // kirim 100% default

    event Settled(address indexed trader, int256 pnl, uint256 fee, uint256 paidFromBuffer, uint256 paidFromPool);
    event FeeSplitUpdated(uint256 relayerBps, uint256 teamBps, uint256 bufferBps);
    event StreamConfigUpdated(uint256 interval, uint256 portionBps);
    event TeamWalletUpdated(address team);
    event StreamedToVault(uint256 amount);

    constructor(address _usdc, address _vaultPool, address _teamWallet) {
        require(_usdc != address(0), "StabilityFund: invalid USDC");
        require(_vaultPool != address(0), "StabilityFund: invalid vault");
        require(_teamWallet != address(0), "StabilityFund: invalid team");

        usdc = IERC20(_usdc);
        vaultPool = IVaultPool(_vaultPool);
        teamWallet = _teamWallet;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SETTLER_ROLE, msg.sender);
        _grantRole(STREAMER_ROLE, msg.sender);
    }

    /**
     * @notice Settle PnL + fee sebuah trade.
     * @param trader alamat trader
     * @param collateral jumlah kolateral yang ditahan (6 desimal)
     * @param pnl profit/loss (positif = profit trader, negatif = loss trader)
     * @param tradingFee total fee dalam USDC
     * @param relayer relayer yang menjalankan transaksi (opsional)
     */
    function settleTrade(address trader, uint256 collateral, int256 pnl, uint256 tradingFee, address relayer)
        external
        onlyRole(SETTLER_ROLE)
        nonReentrant
    {
        require(trader != address(0), "StabilityFund: invalid trader");

        // hitung fee split
        uint256 relayerFee = (tradingFee * feeToRelayerBps) / 10000;
        uint256 teamFee = (tradingFee * feeToTeamBps) / 10000;
        uint256 bufferFee = tradingFee - relayerFee - teamFee;

        // kirim fee relayer jika diset
        if (relayerFee > 0 && relayer != address(0)) {
            usdc.safeTransfer(relayer, relayerFee);
        }

        // kirim fee team
        if (teamFee > 0) {
            usdc.safeTransfer(teamWallet, teamFee);
        }

        // buffer menyimpan bufferFee secara implisit (tetap di kontrak)

        uint256 paidFromBuffer;
        uint256 paidFromPool;

        if (pnl >= 0) {
            // profit trader: collateral + pnl - fee
            uint256 payout = collateral + uint256(pnl);
            if (payout >= tradingFee) {
                payout -= tradingFee;
            } else {
                payout = 0; // fee lebih besar dari payout
            }

            uint256 bufferBal = usdc.balanceOf(address(this));
            if (bufferBal >= payout) {
                if (payout > 0) {
                    usdc.safeTransfer(trader, payout);
                    paidFromBuffer = payout;
                }
            } else {
                if (bufferBal > 0) {
                    usdc.safeTransfer(trader, bufferBal);
                    paidFromBuffer = bufferBal;
                }
                uint256 shortfall = payout - bufferBal;
                // minta vault menutup kekurangan
                vaultPool.coverPayout(trader, shortfall);
                paidFromPool = shortfall;
            }
        } else {
            // loss trader: kontrak menahan collateral, kerugian jadi surplus buffer
            uint256 loss = uint256(-pnl);
            uint256 deductions = tradingFee + loss;
            uint256 refund = collateral > deductions ? collateral - deductions : 0;

            if (refund > 0) {
                usdc.safeTransfer(trader, refund);
                paidFromBuffer = refund;
            }

            // jika kerugian lebih besar dari collateral, cap di collateral (bad debt ditangani off-chain)
        }

        emit Settled(trader, pnl, tradingFee, paidFromBuffer, paidFromPool);
    }

    /**
     * @notice Pull collateral from trader into the buffer (single approval target).
     * @dev Called by executors with SETTLER_ROLE.
     */
    function collectCollateral(address trader, uint256 amount) external onlyRole(SETTLER_ROLE) nonReentrant {
        require(trader != address(0), "StabilityFund: invalid trader");
        require(amount > 0, "StabilityFund: zero amount");
        usdc.safeTransferFrom(trader, address(this), amount);
    }

    /**
     * @notice Stream surplus buffer ke VaultPool (sesuai interval).
     */
    function streamToVault() external onlyRole(STREAMER_ROLE) nonReentrant {
        require(block.timestamp >= lastStreamAt + streamInterval, "StabilityFund: stream cooldown");

        uint256 bal = usdc.balanceOf(address(this));
        require(bal > 0, "StabilityFund: nothing to stream");

        uint256 amount = (bal * streamPortionBps) / 10000;
        lastStreamAt = block.timestamp;

        usdc.safeTransfer(address(vaultPool), amount);
        vaultPool.receiveFromSettlement(amount);

        emit StreamedToVault(amount);
    }

    function updateFeeSplit(uint256 relayerBps, uint256 teamBps, uint256 bufferBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(relayerBps + teamBps + bufferBps == 10000, "StabilityFund: split must total 100%");
        feeToRelayerBps = relayerBps;
        feeToTeamBps = teamBps;
        feeToBufferBps = bufferBps;
        emit FeeSplitUpdated(relayerBps, teamBps, bufferBps);
    }

    function updateTeamWallet(address _team) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_team != address(0), "StabilityFund: invalid team");
        teamWallet = _team;
        emit TeamWalletUpdated(_team);
    }

    function updateStreamConfig(uint256 interval, uint256 portionBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(portionBps <= 10000, "StabilityFund: invalid portion");
        require(interval >= 5 minutes, "StabilityFund: interval too small");
        streamInterval = interval;
        streamPortionBps = portionBps;
        emit StreamConfigUpdated(interval, portionBps);
    }

    function updateVault(address _vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_vault != address(0), "StabilityFund: invalid vault");
        vaultPool = IVaultPool(_vault);
    }
}
