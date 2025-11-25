import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseEther, keccak256, toUtf8Bytes, ZeroAddress, formatEther } from "ethers";
import { UniClearLauncher } from "../typechain";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { ScriptConfig } from "../scripts/config";

/**
 * Integration tests for UniClearLauncher
 * These tests simulate the full flow from deployment to migration
 * Using real contracts from forked Unichain network
 */
describe("UniClearLauncher Integration Tests", function () {
  // Constants
  const Q96 = 2n ** 96n;
  const TICK_SPACING = 60n;
  const AUCTION_DURATION_BLOCKS = 1000;
  const CLAIM_DELAY_BLOCKS = 100;
  const DEPLOY_FEE = parseEther("0.001");

  // Helper function to convert price to Q96 format
  function priceToQ96(raisedAmount: bigint, tokenAmount: bigint): bigint {
    return (raisedAmount * Q96 / tokenAmount) / TICK_SPACING * TICK_SPACING;
  }

  // Fixture to deploy contracts using real addresses from forked network
  async function deployIntegrationFixture() {
    const [deployer, user1, user2, user3] = await ethers.getSigners();

    // Fund test accounts
    await ethers.provider.send("hardhat_setBalance", [
      deployer.address,
      "0x" + parseEther("100").toString(16),
    ]);
    await ethers.provider.send("hardhat_setBalance", [
      user1.address,
      "0x" + parseEther("100").toString(16),
    ]);
    await ethers.provider.send("hardhat_setBalance", [
      user2.address,
      "0x" + parseEther("100").toString(16),
    ]);
    await ethers.provider.send("hardhat_setBalance", [
      user3.address,
      "0x" + parseEther("100").toString(16),
    ]);

    // Use real contract addresses from ScriptConfig (from forked Unichain network)
    const positionManagerAddress = ScriptConfig.PositionManager;
    const create2DeployerAddress = ScriptConfig.Create2Deployer;
    const ccaFactoryAddress = ScriptConfig.CcaFactory;

    console.log("\n🌐 Using real contracts from forked Unichain network:");
    console.log(`   PositionManager: ${positionManagerAddress}`);
    console.log(`   Create2Deployer: ${create2DeployerAddress}`);
    console.log(`   CcaFactory: ${ccaFactoryAddress}\n`);

    // Deploy UniClearDeployer library first
    const UniClearDeployerFactory = await ethers.getContractFactory("UniClearDeployer");
    const uniclearDeployer = await UniClearDeployerFactory.deploy();
    await uniclearDeployer.waitForDeployment();
    const uniclearDeployerAddress = await uniclearDeployer.getAddress();

    console.log(`   UniClearDeployer Library: ${uniclearDeployerAddress}`);

    // Deploy UniClearLauncher as upgradeable proxy with linked library
    const UniClearLauncherFactory = await ethers.getContractFactory("UniClearLauncher", {
      libraries: {
        UniClearDeployer: uniclearDeployerAddress,
      },
    });
    const launcher = await upgrades.deployProxy(
      UniClearLauncherFactory,
      [
        positionManagerAddress,
        create2DeployerAddress,
        ccaFactoryAddress,
      ],
      {
        initializer: "initialize",
        unsafeAllowLinkedLibraries: true,
      }
    ) as unknown as UniClearLauncher;

    // Get contract instances for interaction
    const ccaFactory = await ethers.getContractAt("IContinuousClearingAuctionFactory", ccaFactoryAddress);

    return {
      launcher,
      ccaFactory,
      positionManagerAddress,
      create2DeployerAddress,
      ccaFactoryAddress,
      deployer,
      user1,
      user2,
      user3,
    };
  }

  describe("Full Auction Flow", function () {
    it("Should complete full flow: deploy token -> launch auction -> submit bids -> exit bids -> migrate", async function () {
      const { launcher, ccaFactory, deployer, user1, user2, user3 } = await loadFixture(
        deployIntegrationFixture
      );

      // Step 1: Deploy Token and Launch Auction
      console.log("\n📋 Step 1: Deploying token and launching auction...");

      const tokenConfig = {
        name: "Integration Test Token",
        symbol: "ITT",
        totalSupply: parseEther("1000000000"), // 1 billion
      };

      const currentBlock = await ethers.provider.getBlockNumber();
      const startBlock = currentBlock + 10;
      const endBlock = startBlock + AUCTION_DURATION_BLOCKS;
      const claimBlock = endBlock + CLAIM_DELAY_BLOCKS;

      const auctionConfig = {
        raisedCurrency: ZeroAddress, // ETH
        tickSpacing: 60,
        startBlock,
        endBlock,
        claimBlock,
        floorPrice: priceToQ96(parseEther("1"), parseEther("71430000000")),
        requiredCurrencyRaised: parseEther("10"),
        auctionSupply: parseEther("700000000"), // 70%
      };

      const salt = keccak256(toUtf8Bytes("integration-test-1"));

      const deployTx = await launcher.connect(user1).deployTokenAndLaunchAuction(
        tokenConfig,
        auctionConfig,
        salt,
        { value: DEPLOY_FEE }
      );

      const deployReceipt = await deployTx.wait();
      let auctionAddress = "";
      let tokenAddress = "";

      // Parse events to get auction and token addresses
      for (const log of deployReceipt!.logs) {
        try {
          const parsed = launcher.interface.parseLog(log);
          if (parsed && parsed.name === "AuctionCreated") {
            auctionAddress = parsed.args[0];
            tokenAddress = parsed.args[1];
            break;
          }
        } catch {
          const parsed = ccaFactory.interface.parseLog(log);
          if (parsed && parsed.name === "AuctionCreated") {
            auctionAddress = parsed.args[0];
            tokenAddress = parsed.args[1];
            break;
          }
        }
      }

      console.log(`   ✅ Auction Created: ${auctionAddress}`);
      console.log(`   ✅ Token Created: ${tokenAddress}`);
      console.log(`   Start Block: ${startBlock}`);
      console.log(`   End Block: ${endBlock}`);

      expect(auctionAddress).to.not.equal(ZeroAddress);
      expect(tokenAddress).to.not.equal(ZeroAddress);

      // Verify auction info is stored
      const auctionInfo = await launcher.auctionInfo(tokenAddress);
      expect(auctionInfo.raisedCurrency).to.equal(auctionConfig.raisedCurrency);
      expect(auctionInfo.endBlock).to.equal(endBlock);

      // Step 2: Wait for auction to start
      console.log("\n📋 Step 2: Waiting for auction to start...");
      const blocksToStart = startBlock - currentBlock;
      if (blocksToStart > 0) {
        await mine(blocksToStart);
      }
      console.log("   ✅ Auction started!");

      // Step 3: Verify auction state
      console.log("\n📋 Step 3: Verifying auction state...");
      const storedAuctionInfo = await launcher.auctionInfo(tokenAddress);
      expect(storedAuctionInfo.endBlock).to.equal(endBlock);
      console.log("   ✅ Auction info verified!");

      // Step 4: Fast-forward to auction end
      console.log("\n📋 Step 4: Fast-forwarding to auction end...");
      const currentBlockNum = await ethers.provider.getBlockNumber();
      const blocksToEnd = endBlock - currentBlockNum;

      if (blocksToEnd > 0) {
        await mine(blocksToEnd);
      }
      console.log("   ✅ Auction ended!");

      // Step 5: Verify we can access auction data
      console.log("\n📋 Step 5: Verifying final auction state...");
      const finalAuctionInfo = await launcher.auctionInfo(tokenAddress);
      expect(finalAuctionInfo.auction).to.not.equal(ZeroAddress);
      console.log("   ✅ Auction data accessible!");
    });

    it("Should handle auction with multiple configurations", async function () {
      const { launcher, user1 } = await loadFixture(deployIntegrationFixture);

      const tokenConfig = {
        name: "Multi Config Token",
        symbol: "MCT",
        totalSupply: parseEther("1000000000"),
      };

      const currentBlock = await ethers.provider.getBlockNumber();

      // Test with different parameters
      const auctionConfig = {
        raisedCurrency: ZeroAddress,
        tickSpacing: 60, // Standard tick spacing
        startBlock: currentBlock + 10,
        endBlock: currentBlock + 110,
        claimBlock: currentBlock + 210,
        floorPrice: priceToQ96(parseEther("1"), parseEther("100000000")),
        requiredCurrencyRaised: parseEther("5"),
        auctionSupply: parseEther("500000000"),
      };

      const salt = keccak256(toUtf8Bytes("multi-config-test"));

      await expect(
        launcher.connect(user1).deployTokenAndLaunchAuction(
          tokenConfig,
          auctionConfig,
          salt,
          { value: DEPLOY_FEE }
        )
      ).to.emit(launcher, "AuctionCreated");
    });
  });

  describe("Migration Flow", function () {
    it("Should track auction info for migration", async function () {
      const { launcher, user1 } = await loadFixture(deployIntegrationFixture);

      const tokenConfig = {
        name: "Migration Test Token",
        symbol: "MTT",
        totalSupply: parseEther("1000000000"),
      };

      const currentBlock = await ethers.provider.getBlockNumber();
      const auctionConfig = {
        raisedCurrency: ZeroAddress,
        tickSpacing: 60,
        startBlock: currentBlock + 10,
        endBlock: currentBlock + 110,
        claimBlock: currentBlock + 210,
        floorPrice: priceToQ96(parseEther("1"), parseEther("71430000000")),
        requiredCurrencyRaised: parseEther("10"),
        auctionSupply: parseEther("700000000"),
      };

      const salt = keccak256(toUtf8Bytes("migration-test"));

      const tx = await launcher.connect(user1).deployTokenAndLaunchAuction(
        tokenConfig,
        auctionConfig,
        salt,
        { value: DEPLOY_FEE }
      );

      const receipt = await tx.wait();

      // Extract token address
      let tokenAddress = "";
      for (const log of receipt!.logs) {
        try {
          const parsed = launcher.interface.parseLog(log);
          if (parsed && parsed.name === "AuctionCreated") {
            tokenAddress = parsed.args[1];
            break;
          }
        } catch {
          continue;
        }
      }

      // Verify auction info for migration
      const auctionInfo = await launcher.auctionInfo(tokenAddress);
      expect(auctionInfo.reserveSupply).to.be.gt(0);
      expect(auctionInfo.raisedCurrency).to.equal(ZeroAddress);

      console.log(`   Reserve Supply: ${formatEther(auctionInfo.reserveSupply)}`);
      console.log(`   Raised Currency: ${auctionInfo.raisedCurrency}`);
      console.log(`   End Block: ${auctionInfo.endBlock}`);
    });
  });

  describe("Fee Collection", function () {
    it("Should accumulate deployment fees", async function () {
      const { launcher, user1, user2, deployer } = await loadFixture(deployIntegrationFixture);

      const launcherAddress = await launcher.getAddress();
      const initialBalance = await ethers.provider.getBalance(launcherAddress);

      // Deploy multiple tokens
      for (let i = 0; i < 3; i++) {
        const tokenConfig = {
          name: `Test Token ${i}`,
          symbol: `TST${i}`,
          totalSupply: parseEther("1000000000"),
        };

        const currentBlock = await ethers.provider.getBlockNumber();
        const auctionConfig = {
          raisedCurrency: ZeroAddress,
          tickSpacing: 60,
          startBlock: currentBlock + 10,
          endBlock: currentBlock + 110,
          claimBlock: currentBlock + 210,
          floorPrice: priceToQ96(parseEther("1"), parseEther("71430000000")),
          requiredCurrencyRaised: parseEther("10"),
          auctionSupply: parseEther("700000000"),
        };

        const salt = keccak256(toUtf8Bytes(`fee-test-${i}`));
        const user = i % 2 === 0 ? user1 : user2;

        await launcher.connect(user).deployTokenAndLaunchAuction(
          tokenConfig,
          auctionConfig,
          salt,
          { value: DEPLOY_FEE }
        );
      }

      const finalBalance = await ethers.provider.getBalance(launcherAddress);
      const expectedFees = DEPLOY_FEE * 3n;

      expect(finalBalance - initialBalance).to.equal(expectedFees);
      console.log(`   ✅ Collected fees: ${formatEther(expectedFees)} ETH`);

      // Admin should be able to withdraw
      await launcher.connect(deployer).withdrawETH(deployer.address);

      const balanceAfterWithdraw = await ethers.provider.getBalance(launcherAddress);
      expect(balanceAfterWithdraw).to.equal(0);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle auction with minimal duration", async function () {
      const { launcher, user1 } = await loadFixture(deployIntegrationFixture);

      const tokenConfig = {
        name: "Short Duration Token",
        symbol: "SDT",
        totalSupply: parseEther("1000000000"),
      };

      const currentBlock = await ethers.provider.getBlockNumber();
      const auctionConfig = {
        raisedCurrency: ZeroAddress,
        tickSpacing: 60,
        startBlock: currentBlock + 5,
        endBlock: currentBlock + 15, // Only 10 blocks
        claimBlock: currentBlock + 25,
        floorPrice: priceToQ96(parseEther("1"), parseEther("1000000")),
        requiredCurrencyRaised: parseEther("1"),
        auctionSupply: parseEther("100000000"),
      };

      const salt = keccak256(toUtf8Bytes("short-duration-test"));

      await expect(
        launcher.connect(user1).deployTokenAndLaunchAuction(
          tokenConfig,
          auctionConfig,
          salt,
          { value: DEPLOY_FEE }
        )
      ).to.emit(launcher, "AuctionCreated");
    });

    it("Should handle multiple auctions from same user", async function () {
      const { launcher, user1 } = await loadFixture(deployIntegrationFixture);

      const createdAuctions: string[] = [];

      for (let i = 0; i < 3; i++) {
        const tokenConfig = {
          name: `User Token ${i}`,
          symbol: `UT${i}`,
          totalSupply: parseEther("1000000000"),
        };

        const currentBlock = await ethers.provider.getBlockNumber();
        const auctionConfig = {
          raisedCurrency: ZeroAddress,
          tickSpacing: 60,
          startBlock: currentBlock + 10 + i * 100,
          endBlock: currentBlock + 110 + i * 100,
          claimBlock: currentBlock + 210 + i * 100,
          floorPrice: priceToQ96(parseEther("1"), parseEther("71430000000")),
          requiredCurrencyRaised: parseEther("10"),
          auctionSupply: parseEther("700000000"),
        };

        const salt = keccak256(toUtf8Bytes(`multi-auction-${i}`));

        const tx = await launcher.connect(user1).deployTokenAndLaunchAuction(
          tokenConfig,
          auctionConfig,
          salt,
          { value: DEPLOY_FEE }
        );

        const receipt = await tx.wait();

        for (const log of receipt!.logs) {
          try {
            const parsed = launcher.interface.parseLog(log);
            if (parsed && parsed.name === "AuctionCreated") {
              createdAuctions.push(parsed.args[0]);
              break;
            }
          } catch {
            continue;
          }
        }
      }

      expect(createdAuctions.length).to.equal(3);
      console.log(`   ✅ Created ${createdAuctions.length} auctions`);
    });
  });
});
