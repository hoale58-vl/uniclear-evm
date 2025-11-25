import hre from "hardhat";

type Config = {
};

const unichainScriptConfig: Config = {
};

const unichainSepoliaScriptConfig: Config = {
};

const configs: Record<string, Config> = {
  "unichain": unichainScriptConfig,
  "unichainSepolia": unichainSepoliaScriptConfig,
};

export const ScriptConfig: Config = configs[hre.network.name];
