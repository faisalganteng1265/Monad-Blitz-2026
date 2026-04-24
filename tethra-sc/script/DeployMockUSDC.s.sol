// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/token/MockUSDC.sol";

contract DeployMockUSDC is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy with 1,000,000 USDC initial supply minted to deployer
        MockUSDC usdc = new MockUSDC(1_000_000);

        console.log("MockUSDC deployed:", address(usdc));
        console.log("Deployer balance: ", usdc.balanceOf(msg.sender));

        vm.stopBroadcast();
    }
}
