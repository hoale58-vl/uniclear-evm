import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ScriptConfig } from "../scripts/config";
import { parseEther, parseUnits } from "ethers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { save } = deployments;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    console.log("====================");
    console.log("Deploy UniClear Contracts");
    console.log("====================");

    // USDC
    await deploy("MockUSDC", {
        contract: "MockUSDC",
        args: ["USDC", "USDC", parseUnits("100000000000", 6)],
        from: deployer,
        log: true,
        autoMine: true,
        skipIfAlreadyDeployed: false,
    });

    // UNI
    await deploy("MockUNI", {
        contract: "MockERC20",
        args: ["USDC", "USDC", parseEther("100000000000")],
        from: deployer,
        log: true,
        autoMine: true,
        skipIfAlreadyDeployed: false,
    });
};

func.tags = ["uniclear"];
export default func;
