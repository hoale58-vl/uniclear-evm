import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ScriptConfig } from "../scripts/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { save } = deployments;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    console.log("====================");
    console.log("Deploy UniClear Contracts");
    console.log("====================");

    // UniClearDeployer
    const UniClearDeployer = await deploy("UniClearDeployer", {
        contract: "UniClearDeployer",
        from: deployer,
        log: true,
        autoMine: true,
        skipIfAlreadyDeployed: false,
    });

    await deploy("UniClearLauncher", {
        proxy: {
            proxyContract: "UUPS",
            execute: {
                init: {
                    methodName: "initialize",
                    args: [
                        ScriptConfig.PositionManager,
                        ScriptConfig.Create2Deployer,
                        ScriptConfig.CcaFactory
                    ],
                },
                onUpgrade: {
                    methodName: "deployFee",
                    args: [],
                },
            },
        },
        contract: "UniClearLauncher",
        libraries: { UniClearDeployer: UniClearDeployer.address },
        from: deployer,
        log: true,
        autoMine: true,
        skipIfAlreadyDeployed: false,
    });
};

func.tags = ["uniclear"];
export default func;
