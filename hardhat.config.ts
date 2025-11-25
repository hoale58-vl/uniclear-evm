import { task } from "hardhat/config";
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-chai-matchers";
import "hardhat-contract-sizer";
import "hardhat-abi-exporter";
import "hardhat-gas-reporter";
import * as dotenv from "dotenv";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "@nomicfoundation/hardhat-ethers";
import "@typechain/hardhat";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const {
  PRIVATE_KEY: privateKey = "0x0000000000000000000000000000000000000000000000000000000000000001",
  ETHERSCAN_API: etherscanApi,
} = process.env;
const reportGas = process.env.REPORT_GAS;

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    "unichainSepolia": {
      url: "https://unichain-sepolia-rpc.publicnode.com",
      chainId: 1301,
      gasPrice: 1000000000,
      accounts: [privateKey],
      timeout: 2_147_483_647,
    },
    "unichain": {
      url: "https://unichain-rpc.publicnode.com",
      chainId: 130,
      gasPrice: 10000000,
      accounts: [privateKey],
      timeout: 2_147_483_647,
    },
    ethereum: {
      url: "https://eth.llamarpc.com",
      chainId: 1,
      accounts: [privateKey],
      timeout: 2_147_483_647,
    },
    hardhat: {
      forking: {
        url: "https://unichain.drpc.org"
      }
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.8.26",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
          viaIR: true,
          evmVersion: "cancun",
        },
      }
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  abiExporter: {
    path: "data/abi",
    runOnCompile: true,
    clear: true,
    flat: false,
    only: [],
    spacing: 4,
  },
  gasReporter: {
    enabled: reportGas == "1",
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
  },
  etherscan: {
    apiKey: {
      "unichain": etherscanApi,
      "ethereum": etherscanApi,
    },
    customChains: [
      {
        network: "unichain",
        chainId: 130,
        urls: {
          apiURL: "https://api.uniscan.xyz/api",
          browserURL: "https://uniscan.xyz",
        },
      },
      {
        network: "ethereum",
        chainId: 1
      },
    ],
  },
  sourcify: {
    // Disabled by default
    // Doesn't need an API key
    enabled: false,
  },
  mocha: {
    timeout: 200000,
  },
  namedAccounts: {
    deployer: 0,
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },
};
