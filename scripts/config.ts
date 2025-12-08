import hre from "hardhat";

type Config = {
  PositionManager: string,
  Create2Deployer: string,
  CcaFactory: string,
};

const unichainScriptConfig: Config = {
  PositionManager: "0x4529a01c7a0410167c5740c487a8de60232617bf",
  Create2Deployer: "0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2",
  CcaFactory: "0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D",
};

const unichainSepoliaScriptConfig: Config = {
  PositionManager: "0xf969aee60879c54baaed9f3ed26147db216fd664",
  Create2Deployer: "0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2",
  CcaFactory: "0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D",
};

const baseScriptConfig: Config = {
  PositionManager: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
  Create2Deployer: "0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2",
  CcaFactory: "0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D",
};


const configs: Record<string, Config> = {
  "unichain": unichainScriptConfig,
  "base": baseScriptConfig,
  "unichainSepolia": unichainSepoliaScriptConfig,
  "hardhat": unichainScriptConfig,
};

export const ScriptConfig: Config = configs[hre.network.name];
