// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {UniClearToken} from "./UniClearToken.sol";
import {IUniClearLauncher} from "./interfaces/IUniClearLauncher.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

interface ICreate2Deployer {
    function deploy(uint256 value, bytes32 salt, bytes memory code) external;

    function computeAddress(bytes32 salt, bytes32 codeHash) external view returns (address);
}

/// @notice UniClear Token Launcher
library UniClearDeployer {
    function deployToken(
        address create2Deployer,
        IUniClearLauncher.TokenConfig memory tokenConfig,
        address receiver
    ) external returns (address tokenAddress) {
        bytes memory bytecode = abi.encodePacked(
            type(UniClearToken).creationCode,
            abi.encode(tokenConfig.name, tokenConfig.symbol, receiver, uint256(tokenConfig.totalSupply))
        );
        ICreate2Deployer(create2Deployer).deploy(0, tokenConfig.salt, bytecode);

        bytes32 codeHash = keccak256(bytecode);
        return ICreate2Deployer(create2Deployer).computeAddress(tokenConfig.salt, codeHash);
    }
}
