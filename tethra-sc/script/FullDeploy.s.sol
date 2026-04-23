// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/token/MockUSDC.sol";
import "../src/token/TethraToken.sol";
import "../src/risk/RiskManager.sol";
import "../src/trading/PositionManager.sol";
import "../src/treasury/VaultPool.sol";
import "../src/treasury/StabilityFund.sol";
import "../src/trading/MarketExecutor.sol";
import "../src/trading/LimitExecutor.sol";
import "../src/trading/TapToTradeExecutor.sol";
import "../src/trading/OneTapProfit.sol";
import "../src/paymaster/USDCPaymaster.sol";
import "../src/staking/TethraStaking.sol";

/**
 * @title FullDeploy
 * @notice Complete deployment script for Tethra DEX with automatic role grants
 * @dev Deploys all contracts, grants roles, and initializes token distribution
 *
 * Usage:
 * forge script script/FullDeploy.s.sol \
 *   --rpc-url https://sepolia.base.org \
 *   --private-key YOUR_PRIVATE_KEY \
 *   --broadcast
 */
contract FullDeploy is Script {
    // Contract instances
    MockUSDC public mockUSDC;
    TethraToken public tethraToken;
    RiskManager public riskManager;
    PositionManager public positionManager;
    VaultPool public vaultPool;
    StabilityFund public stabilityFund;
    MarketExecutor public marketExecutor;
    LimitExecutor public limitExecutor;
    TapToTradeExecutor public tapToTradeExecutor;
    OneTapProfit public oneTapProfit;
    USDCPaymaster public usdcPaymaster;
    TethraStaking public tethraStaking;

    // Addresses
    address public deployer;
    address public teamWallet;
    address public protocolTreasury;
    address public keeperWallet;
    address public priceSignerWallet;
    address public relayerWallet;
    address public creWallet;

    function run() external {
        deployer = vm.envAddress("DEPLOYER_ADDRESS");

        // Setup addresses (can be env vars or use deployer as default)
        try vm.envAddress("TEAM_WALLET") returns (address _team) {
            teamWallet = _team;
        } catch {
            teamWallet = deployer; // Default to deployer
        }
        try vm.envAddress("PROTOCOL_TREASURY") returns (address _treasury) {
            protocolTreasury = _treasury;
        } catch {
            protocolTreasury = deployer;
        }
        try vm.envAddress("KEEPER_WALLET") returns (address _keeper) {
            keeperWallet = _keeper;
        } catch {
            keeperWallet = deployer;
        }
        try vm.envAddress("PRICE_SIGNER_WALLET") returns (address _signer) {
            priceSignerWallet = _signer;
        } catch {
            priceSignerWallet = deployer;
        }
        relayerWallet = vm.envAddress("RELAYER_WALLET");
        try vm.envAddress("CRE_WALLET_ADDRESS") returns (address _cre) {
            creWallet = _cre;
        } catch {
            creWallet = address(0);
        }
        console.log("=================================================");
        console.log("Tethra DEX - Full Deployment Script");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("Team Wallet:", teamWallet);
        console.log("Protocol Treasury:", protocolTreasury);
        console.log("Keeper Wallet:", keeperWallet);
        console.log("Price Signer:", priceSignerWallet);
        console.log("Relayer Wallet:", relayerWallet);
        console.log("=================================================\n");

        vm.startBroadcast();

        // Step 1: Deploy Token Contracts
        console.log("Step 1/6: Deploying Token Contracts...");
        deployTokens();

        // Step 2: Deploy Staking Contracts
        console.log("\nStep 2/6: Deploying Staking Contracts...");
        deployStakingContracts();

        // Step 3: Deploy Core Trading Contracts
        console.log("\nStep 3/6: Deploying Core Trading Contracts...");
        deployCoreContracts();

        // Step 4: Deploy Advanced Trading Contracts
        console.log("\nStep 4/6: Deploying Advanced Trading Contracts...");
        deployAdvancedTrading();

        // Step 5: Setup Roles & Initialize
        console.log("\nStep 5/6: Setting up Roles & Initializing...");
        setupRolesAndInitialize();

        vm.stopBroadcast();

        // Print deployment summary
        printDeploymentSummary();

        // Save deployment to JSON
        saveDeployment();
    }

    function deployTokens() internal {
        // Deploy Mock USDC (testnet only) - 10M initial supply
        mockUSDC = new MockUSDC(10_000_000);
        console.log("  MockUSDC deployed:", address(mockUSDC));

        // Deploy Tethra Token
        tethraToken = new TethraToken();
        console.log("  TethraToken deployed:", address(tethraToken));
    }

    function deployCoreContracts() internal {
        // Deploy RiskManager
        riskManager = new RiskManager();
        console.log("  RiskManager deployed:", address(riskManager));

        // Deploy PositionManager (no constructor params)
        positionManager = new PositionManager();
        console.log("  PositionManager deployed:", address(positionManager));

        // Deploy VaultPool
        vaultPool = new VaultPool(address(mockUSDC));
        console.log("  VaultPool deployed:", address(vaultPool));

        // Deploy StabilityFund
        stabilityFund = new StabilityFund(
            address(mockUSDC),
            address(vaultPool),
            teamWallet
        );
        console.log("  StabilityFund deployed:", address(stabilityFund));

        // Deploy MarketExecutor (needs backendSigner)
        marketExecutor = new MarketExecutor(
            address(mockUSDC),
            address(riskManager),
            address(positionManager),
            address(stabilityFund),
            priceSignerWallet // backendSigner
        );
        console.log("  MarketExecutor deployed:", address(marketExecutor));

        // Deploy USDCPaymaster (needs usdcPerEth rate, e.g., 3000 USDC per ETH)
        usdcPaymaster = new USDCPaymaster(
            address(mockUSDC),
            3000_000000 // 3000 USDC per ETH (6 decimals)
        );
        console.log("  USDCPaymaster deployed:", address(usdcPaymaster));
    }

    function deployAdvancedTrading() internal {
        // Deploy LimitExecutorV2 (needs keeper and backendSigner)
        limitExecutor = new LimitExecutor(
            address(mockUSDC),
            address(riskManager),
            address(positionManager),
            address(stabilityFund),
            keeperWallet, // keeper
            priceSignerWallet // backendSigner
        );
        console.log("  LimitExecutor deployed:", address(limitExecutor));

        // Deploy TapToTradeExecutor (needs backendSigner)
        tapToTradeExecutor = new TapToTradeExecutor(
            address(mockUSDC),
            address(riskManager),
            address(positionManager),
            address(stabilityFund),
            priceSignerWallet // backendSigner
        );
        console.log(
            "  TapToTradeExecutor deployed:",
            address(tapToTradeExecutor)
        );

        // Deploy OneTapProfit (needs backendSigner, keeper, and settler)
        oneTapProfit = new OneTapProfit(
            address(mockUSDC),
            address(stabilityFund),
            priceSignerWallet,
            keeperWallet,
            keeperWallet
        );
        console.log("  OneTapProfit deployed:", address(oneTapProfit));
    }

    function deployStakingContracts() internal {
        // Deploy TethraStaking
        tethraStaking = new TethraStaking(
            address(tethraToken),
            address(mockUSDC)
        );
        console.log("  TethraStaking deployed:", address(tethraStaking));
    }

    function setupRolesAndInitialize() internal {
        console.log("\n  === Granting Roles ===");

        // Roles
        bytes32 settlerRole = stabilityFund.SETTLER_ROLE();
        bytes32 vaultSettlerRole = vaultPool.SETTLER_ROLE();
        bytes32 pmExecutorRole = positionManager.EXECUTOR_ROLE();
        bytes32 meSignerRole = marketExecutor.BACKEND_SIGNER_ROLE();

        // Grant EXECUTOR_ROLE on PositionManager to all executors + relayer/keeper
        positionManager.grantRole(pmExecutorRole, address(marketExecutor));
        positionManager.grantRole(pmExecutorRole, address(limitExecutor));
        positionManager.grantRole(pmExecutorRole, address(tapToTradeExecutor));
        positionManager.grantRole(pmExecutorRole, address(oneTapProfit));
        positionManager.grantRole(pmExecutorRole, keeperWallet);
        console.log(
            "Granted EXECUTOR_ROLE on PositionManager to executors + relayer"
        );

        // Grant SETTLER_ROLE on StabilityFund to all executors + relayer
        stabilityFund.grantRole(settlerRole, address(marketExecutor));
        stabilityFund.grantRole(settlerRole, address(limitExecutor));
        stabilityFund.grantRole(settlerRole, address(tapToTradeExecutor));
        stabilityFund.grantRole(settlerRole, address(oneTapProfit));
        stabilityFund.grantRole(settlerRole, keeperWallet);
        console.log(
            "Granted SETTLER_ROLE on StabilityFund to executors + relayer"
        );

        // Grant SETTLER_ROLE on VaultPool to StabilityFund (so buffer can pay from pool)
        vaultPool.grantRole(vaultSettlerRole, address(stabilityFund));
        console.log("Granted SETTLER_ROLE on VaultPool to StabilityFund");

        // Grant SETTLER_ROLE on VaultPool to relayer wallet
        vaultPool.grantRole(vaultSettlerRole, relayerWallet);
        console.log("Granted SETTLER_ROLE on VaultPool to Relayer Wallet");

        // Ensure backend signer role on MarketExecutor
        marketExecutor.grantRole(meSignerRole, priceSignerWallet);
        console.log(
            "Granted BACKEND_SIGNER_ROLE on MarketExecutor to price signer"
        );

        // Grant KEEPER_ROLE on LimitExecutor to keeper wallet
        bytes32 limitKeeperRole = limitExecutor.KEEPER_ROLE();
        limitExecutor.grantRole(limitKeeperRole, keeperWallet);
        console.log("Granted KEEPER_ROLE on LimitExecutor to Keeper Wallet");

        // Grant KEEPER_ROLE on TapToTradeExecutor to keeper wallet
        bytes32 tttKeeperRole = tapToTradeExecutor.KEEPER_ROLE();
        tapToTradeExecutor.grantRole(tttKeeperRole, keeperWallet);
        console.log(
            "Granted KEEPER_ROLE on TapToTradeExecutor to Keeper Wallet"
        );

        // === CRE Wallet Role Grants ===
        if (creWallet != address(0)) {
            console.log("\n  === CRE Wallet Roles ===");

            // Feature 1: Decentralized Keeper
            limitExecutor.grantRole(limitExecutor.KEEPER_ROLE(), creWallet);
            limitExecutor.grantRole(
                limitExecutor.BACKEND_SIGNER_ROLE(),
                creWallet
            );
            marketExecutor.grantRole(
                marketExecutor.BACKEND_SIGNER_ROLE(),
                creWallet
            );
            stabilityFund.grantRole(stabilityFund.STREAMER_ROLE(), creWallet);
            console.log("Granted Keeper roles to CRE wallet:", creWallet);

            // Feature 2: Private OTP Settlement
            oneTapProfit.grantRole(oneTapProfit.CRE_SETTLER_ROLE(), creWallet);
            console.log(
                "Granted CRE_SETTLER_ROLE on OneTapProfit to CRE wallet"
            );
        }

        console.log("\n  === Initializing Contracts ===");

        // Initialize TethraToken distribution
        tethraToken.initialize(
            protocolTreasury, // Treasury allocation
            teamWallet, // Team allocation
            address(tethraStaking), // Staking rewards
            address(vaultPool) // Route liquidity mining allocation to vault pool
        );
        console.log("Initialized TethraToken distribution");
        console.log("    - Treasury:", protocolTreasury, "- 1M TETH");
        console.log("    - Team:", teamWallet, "- 2M TETH");
        console.log("    - Staking:", address(tethraStaking), "- 5M TETH");
        console.log(
            "    - Vault Pool (liquidity allocation):",
            address(vaultPool),
            "- 2M TETH"
        );

        console.log("\n  === Seeding VaultPool USDC ===");
        uint256 initialVaultUsdc;
        try vm.envUint("VAULTPOOL_INITIAL_USDC") returns (uint256 _amount) {
            initialVaultUsdc = _amount;
        } catch {
            initialVaultUsdc = 50_000_000_000; // 50,000 USDC (6 decimals)
        }
        if (initialVaultUsdc > 0) {
            mockUSDC.mint(address(vaultPool), initialVaultUsdc);
            console.log("Minted USDC to VaultPool:", initialVaultUsdc);
        }
    }

    function printDeploymentSummary() internal view {
        console.log("\n=================================================");
        console.log("DEPLOYMENT SUMMARY");
        console.log("=================================================");
        console.log("\nToken Contracts:");
        console.log("  MockUSDC:", address(mockUSDC));
        console.log("  TethraToken:", address(tethraToken));

        console.log("\nCore Trading:");
        console.log("  RiskManager:", address(riskManager));
        console.log("  PositionManager:", address(positionManager));
        console.log("  VaultPool:", address(vaultPool));
        console.log("  StabilityFund:", address(stabilityFund));
        console.log("  MarketExecutor:", address(marketExecutor));
        console.log("  USDCPaymaster:", address(usdcPaymaster));

        console.log("\nAdvanced Trading:");
        console.log("  LimitExecutor:", address(limitExecutor));
        console.log("  TapToTradeExecutor:", address(tapToTradeExecutor));
        console.log("  OneTapProfit:", address(oneTapProfit));

        console.log("\nStaking & Incentives:");
        console.log("  TethraStaking:", address(tethraStaking));

        console.log("\nRole Assignments:");
        console.log("  Keeper Wallet:", keeperWallet);
        console.log("  Relayer Wallet:", relayerWallet);
        console.log("  Price Signer:", priceSignerWallet);
        console.log("  Team Wallet:", teamWallet);
        console.log("  Protocol Treasury:", protocolTreasury);

        console.log("\n=================================================");
        console.log("DEPLOYMENT COMPLETE!");
        console.log("=================================================");
        console.log("\nNext Steps:");
        console.log("1. Copy addresses to tethra-fe/.env and tethra-be/.env");
        console.log("2. Test market orders on frontend");
        console.log("3. Verify contracts on BaseScan");
        console.log("=================================================\n");
    }

    function saveDeployment() internal {
        string memory json = string(
            abi.encodePacked(
                "{\n",
                '  "chainId": ',
                vm.toString(block.chainid),
                ",\n",
                '  "deployer": "',
                vm.toString(deployer),
                '",\n',
                '  "timestamp": ',
                vm.toString(block.timestamp),
                ",\n",
                '  "contracts": {\n',
                '    "MockUSDC": "',
                vm.toString(address(mockUSDC)),
                '",\n',
                '    "TethraToken": "',
                vm.toString(address(tethraToken)),
                '",\n',
                '    "RiskManager": "',
                vm.toString(address(riskManager)),
                '",\n',
                '    "PositionManager": "',
                vm.toString(address(positionManager)),
                '",\n',
                '    "VaultPool": "',
                vm.toString(address(vaultPool)),
                '",\n',
                '    "StabilityFund": "',
                vm.toString(address(stabilityFund)),
                '",\n',
                '    "MarketExecutor": "',
                vm.toString(address(marketExecutor)),
                '",\n',
                '    "LimitExecutor": "',
                vm.toString(address(limitExecutor)),
                '",\n',
                '    "TapToTradeExecutor": "',
                vm.toString(address(tapToTradeExecutor)),
                '",\n',
                '    "OneTapProfit": "',
                vm.toString(address(oneTapProfit)),
                '",\n',
                '    "USDCPaymaster": "',
                vm.toString(address(usdcPaymaster)),
                '",\n',
                '    "TethraStaking": "',
                vm.toString(address(tethraStaking)),
                '"\n',
                "  },\n",
                '  "roles": {\n',
                '    "keeperWallet": "',
                vm.toString(keeperWallet),
                '",\n',
                '    "priceSignerWallet": "',
                vm.toString(priceSignerWallet),
                '",\n',
                '    "teamWallet": "',
                vm.toString(teamWallet),
                '",\n',
                '    "protocolTreasury": "',
                vm.toString(protocolTreasury),
                '",\n',
                '    "relayerWallet": "',
                vm.toString(relayerWallet),
                '"\n',
                "  }\n",
                "}"
            )
        );

        // Create deployments directory if it doesn't exist
        string memory network = block.chainid == 84532
            ? "base-sepolia"
            : block.chainid == 8453
                ? "base-mainnet"
                : "unknown";

        string memory filepath = string(
            abi.encodePacked("deployments/", network, "-latest.json")
        );
        vm.writeFile(filepath, json);

        console.log("Deployment saved to:", filepath);
    }
}
