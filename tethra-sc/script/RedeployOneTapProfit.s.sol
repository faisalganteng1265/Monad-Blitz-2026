// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/trading/OneTapProfit.sol";

interface IStabilityFundRoles {
    function SETTLER_ROLE() external view returns (bytes32);
    function grantRole(bytes32 role, address account) external;
}

/**
 * @title RedeployOneTapProfit
 * @notice Redeploy only OneTapProfit with IReceiver + grant all required roles
 *
 * Usage:
 * forge script script/RedeployOneTapProfit.s.sol \
 *   --rpc-url https://sepolia.base.org \
 *   --private-key $PRIVATE_KEY \
 *   --broadcast
 *
 * Required env vars:
 *   DEPLOYER_ADDRESS, USDC_TOKEN_ADDRESS, STABILITY_FUND_ADDRESS,
 *   PRICE_SIGNER_ADDRESS, KEEPER_ADDRESS
 *
 * Optional env vars:
 *   CRE_WALLET_ADDRESS (for CRE_SETTLER_ROLE, defaults to DEPLOYER_ADDRESS)
 */
contract RedeployOneTapProfit is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address usdc = vm.envAddress("USDC_TOKEN_ADDRESS");
        address stabilityFund = vm.envAddress("STABILITY_FUND_ADDRESS");
        address priceSigner = vm.envAddress("PRICE_SIGNER_ADDRESS");
        address keeper = vm.envAddress("KEEPER_ADDRESS");

        address creWallet;
        try vm.envAddress("CRE_WALLET_ADDRESS") returns (address _cre) {
            creWallet = _cre;
        } catch {
            creWallet = deployer;
        }

        console.log("=================================================");
        console.log("Redeploy OneTapProfit (with IReceiver)");
        console.log("=================================================");
        console.log("Deployer:", deployer);
        console.log("USDC:", usdc);
        console.log("StabilityFund:", stabilityFund);
        console.log("PriceSigner:", priceSigner);
        console.log("Keeper:", keeper);
        console.log("CRE Wallet:", creWallet);
        console.log("=================================================\n");

        vm.startBroadcast();

        // 1. Deploy new OneTapProfit
        OneTapProfit oneTapProfit = new OneTapProfit(
            usdc,
            stabilityFund,
            priceSigner,
            keeper,
            keeper // settler = keeper (same wallet for hackathon)
        );
        console.log("OneTapProfit deployed:", address(oneTapProfit));

        // 2. Grant SETTLER_ROLE on StabilityFund to new OneTapProfit
        IStabilityFundRoles sf = IStabilityFundRoles(stabilityFund);
        sf.grantRole(sf.SETTLER_ROLE(), address(oneTapProfit));
        console.log("Granted SETTLER_ROLE on StabilityFund to OneTapProfit");

        // 3. Grant CRE_SETTLER_ROLE on OneTapProfit to CRE wallet
        oneTapProfit.grantRole(oneTapProfit.CRE_SETTLER_ROLE(), creWallet);
        console.log("Granted CRE_SETTLER_ROLE to CRE wallet:", creWallet);

        // 4. Grant KEEPER_ROLE on OneTapProfit to keeper (for placeBetPrivate)
        // Already granted in constructor, but grant to relay wallet too if different
        oneTapProfit.grantRole(oneTapProfit.KEEPER_ROLE(), keeper);
        console.log("Granted KEEPER_ROLE to keeper:", keeper);

        vm.stopBroadcast();

        console.log("\n=================================================");
        console.log("DONE! Update .env files with:");
        console.log("ONE_TAP_PROFIT_ADDRESS=", address(oneTapProfit));
        console.log("=================================================");
    }
}
