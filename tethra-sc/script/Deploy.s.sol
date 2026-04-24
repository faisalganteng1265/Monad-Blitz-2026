// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/trading/PriceAdapter.sol";
import "../src/trading/MultiplierEngine.sol";
import "../src/trading/TapBetManager.sol";
import "../src/treasury/TapVault.sol";

/**
 * @title Deploy
 * @notice Deploys TapX contracts to Monad testnet (or any EVM chain).
 * @dev Set env vars before running:
 *   PYTH_CONTRACT   - Pyth oracle address on target chain
 *   USDC_ADDRESS    - USDC (or MockUSDC) address
 *   PRIVATE_KEY     - deployer private key (with 0x prefix)
 *
 * Run: forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
 */
contract Deploy is Script {
    // Pyth Price Feed IDs — mainnet values, update for testnet if different
    bytes32 constant BTC_PYTH_ID =
        0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 constant ETH_PYTH_ID =
        0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 constant MON_PYTH_ID =
        0x0000000000000000000000000000000000000000000000000000000000000000; // update when live

    function run() external {
        address pythContract = vm.envAddress("PYTH_CONTRACT");
        address usdcAddress  = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast();

        // 1. PriceAdapter
        PriceAdapter priceAdapter = new PriceAdapter(pythContract);
        console.log("PriceAdapter:    ", address(priceAdapter));

        // 2. MultiplierEngine
        MultiplierEngine multiplierEngine = new MultiplierEngine();
        console.log("MultiplierEngine:", address(multiplierEngine));

        // 3. TapVault
        TapVault vault = new TapVault(usdcAddress);
        console.log("TapVault:        ", address(vault));

        // 4. TapBetManager
        TapBetManager manager = new TapBetManager(
            address(vault),
            address(priceAdapter),
            address(multiplierEngine),
            usdcAddress
        );
        console.log("TapBetManager:   ", address(manager));

        // ── Post-deploy wiring ──────────────────────────────────────────────
        vault.setBetManager(address(manager));
        console.log("Vault betManager set to TapBetManager");

        priceAdapter.setPriceId(keccak256("BTC"), BTC_PYTH_ID);
        priceAdapter.setPriceId(keccak256("ETH"), ETH_PYTH_ID);
        if (MON_PYTH_ID != bytes32(0)) {
            priceAdapter.setPriceId(keccak256("MON"), MON_PYTH_ID);
        }
        console.log("Price IDs registered: BTC, ETH");

        vm.stopBroadcast();

        // ── Summary ─────────────────────────────────────────────────────────
        console.log("\n=== Deployment Summary ===");
        console.log("PriceAdapter:    ", address(priceAdapter));
        console.log("MultiplierEngine:", address(multiplierEngine));
        console.log("TapVault:        ", address(vault));
        console.log("TapBetManager:   ", address(manager));
    }
}
