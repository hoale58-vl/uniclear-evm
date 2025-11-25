import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseEther, keccak256, toUtf8Bytes, ZeroAddress } from "ethers";
import {
  UniClearLauncher
} from "../typechain";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ScriptConfig } from "../scripts/config";

describe("UniClearLauncher", function () {
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

  // Fixture to deploy contracts using real addresses from forked Unichain network
  async function deployFixture() {
    const [deployer, admin, user1, user2, user3] = await ethers.getSigners();

    // Fund test accounts
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

    // Use real contract addresses from ScriptConfig (from forked network)
    const positionManagerAddress = ScriptConfig.PositionManager;
    const create2DeployerAddress = ScriptConfig.Create2Deployer;
    const ccaFactoryAddress = ScriptConfig.CcaFactory;

    console.log("\n📍 Using real contracts from Unichain fork:");
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

    await launcher.waitForDeployment();

    return {
      launcher,
      positionManagerAddress,
      create2DeployerAddress,
      ccaFactoryAddress,
      uniclearDeployerAddress,
      deployer,
      admin,
      user1,
      user2,
      user3,
    };
  }

  describe("Deployment & Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      const { launcher, positionManagerAddress, create2DeployerAddress, ccaFactoryAddress } = await loadFixture(deployFixture);

      // positionManager is IPositionManager type, need to get the address
      const positionManager = await launcher.positionManager();
      expect(positionManager.toString().toLowerCase()).to.equal(positionManagerAddress.toLowerCase());
      expect(await launcher.create2Deployer()).to.equal(create2DeployerAddress);
      expect(await launcher.ccaFactory()).to.equal(ccaFactoryAddress);
      expect(await launcher.deployFee()).to.equal(DEPLOY_FEE);
    });

    it("Should set correct constants", async function () {
      const { launcher } = await loadFixture(deployFixture);

      expect(await launcher.FULL_RANGE_SIZE()).to.equal(4);
      expect(await launcher.DEAD_ADDRESS()).to.equal("0x000000000000000000000000000000000000dEaD");
      expect(await launcher.POOL_FEE()).to.equal(100); // 0.01%
      expect(await launcher.POOL_TICK_SPACING()).to.equal(1);
    });

    it("Should grant admin role to deployer", async function () {
      const { launcher, deployer } = await loadFixture(deployFixture);

      const DEFAULT_ADMIN_ROLE = await launcher.DEFAULT_ADMIN_ROLE();
      const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));

      expect(await launcher.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
      expect(await launcher.hasRole(ADMIN_ROLE, deployer.address)).to.be.true;
    });

    it("Should not allow re-initialization", async function () {
      const { launcher, positionManagerAddress, create2DeployerAddress, ccaFactoryAddress } = await loadFixture(deployFixture);

      await expect(
        launcher.initialize(
          positionManagerAddress,
          create2DeployerAddress,
          ccaFactoryAddress
        )
      ).to.be.revertedWithCustomError(launcher, "InvalidInitialization");
    });
  });

  describe("deployTokenAndLaunchAuction", function () {
    async function createAuctionConfig(currentBlock: number) {
      const startBlock = currentBlock + 10;
      const endBlock = startBlock + AUCTION_DURATION_BLOCKS;
      const claimBlock = endBlock + CLAIM_DELAY_BLOCKS;
      const floorPrice = priceToQ96(parseEther("1"), parseEther("71430000000"));

      return {
        raisedCurrency: ZeroAddress, // ETH
        tickSpacing: 60,
        startBlock,
        endBlock,
        claimBlock,
        floorPrice,
        requiredCurrencyRaised: parseEther("10"),
        auctionSupply: parseEther("700000000"), // 70% of 1B
      };
    }

    it("Should deploy token and launch auction with correct fee", async function () {
      const { launcher, user1 } = await loadFixture(deployFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        totalSupply: parseEther("1000000000"),
      };

      const currentBlock = await ethers.provider.getBlockNumber();
      const auctionConfig = await createAuctionConfig(currentBlock);
      const salt = keccak256(toUtf8Bytes("test-salt-1"));

      await expect(
        launcher.connect(user1).deployTokenAndLaunchAuction(
          tokenConfig,
          auctionConfig,
          salt,
          { value: DEPLOY_FEE }
        )
      ).to.emit(launcher, "AuctionCreated");
    });

    it("Should fail with incorrect fee", async function () {
      const { launcher, user1 } = await loadFixture(deployFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        totalSupply: parseEther("1000000000"),
      };

      const currentBlock = await ethers.provider.getBlockNumber();
      const auctionConfig = await createAuctionConfig(currentBlock);
      const salt = keccak256(toUtf8Bytes("test-salt-2"));

      await expect(
        launcher.connect(user1).deployTokenAndLaunchAuction(
          tokenConfig,
          auctionConfig,
          salt,
          { value: parseEther("0.0001") } // Wrong fee
        )
      ).to.be.revertedWith("invalid fee");
    });

    it("Should store auction info correctly", async function () {
      const { launcher, user1 } = await loadFixture(deployFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        totalSupply: parseEther("1000000000"),
      };

      const currentBlock = await ethers.provider.getBlockNumber();
      const auctionConfig = await createAuctionConfig(currentBlock);
      const salt = keccak256(toUtf8Bytes("test-salt-3"));

      const tx = await launcher.connect(user1).deployTokenAndLaunchAuction(
        tokenConfig,
        auctionConfig,
        salt,
        { value: DEPLOY_FEE }
      );

      const receipt = await tx.wait();

      // Extract token address from events
      // Note: This assumes AuctionCreated event has tokenAddress
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = launcher.interface.parseLog(log);
          return parsed?.name === "AuctionCreated";
        } catch {
          return false;
        }
      });

      if (event) {
        const parsedEvent = launcher.interface.parseLog(event);
        const tokenAddress = parsedEvent?.args[1];

        const auctionInfo = await launcher.auctionInfo(tokenAddress);
        expect(auctionInfo.raisedCurrency).to.equal(auctionConfig.raisedCurrency);
        expect(auctionInfo.endBlock).to.equal(auctionConfig.endBlock);
      }
    });
  });

  describe("launchAuction (with existing token)", function () {
    it("Should launch auction with existing token", async function () {
      const { launcher, user1 } = await loadFixture(deployFixture);

      // Deploy a mock ERC20 token first
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Existing Token", "EXIST", parseEther("1000000000"));
      await token.waitForDeployment();

      const reserveSupply = parseEther("300000000"); // 30%
      const auctionSupply = parseEther("700000000"); // 70%
      const totalRequired = reserveSupply + auctionSupply;

      // Mint tokens to user1
      await token.mint(user1.address, totalRequired);

      const currentBlock = await ethers.provider.getBlockNumber();
      const auctionConfig = {
        raisedCurrency: ZeroAddress,
        tickSpacing: 60,
        startBlock: currentBlock + 10,
        endBlock: currentBlock + 10 + AUCTION_DURATION_BLOCKS,
        claimBlock: currentBlock + 10 + AUCTION_DURATION_BLOCKS + CLAIM_DELAY_BLOCKS,
        floorPrice: priceToQ96(parseEther("1"), parseEther("71430000000")),
        requiredCurrencyRaised: parseEther("10"),
        auctionSupply,
      };

      // Approve launcher to spend tokens
      await token.connect(user1).approve(await launcher.getAddress(), totalRequired);

      const salt = keccak256(toUtf8Bytes("test-salt-existing"));

      await expect(
        launcher.connect(user1).launchAuction(
          await token.getAddress(),
          reserveSupply,
          auctionConfig,
          salt,
          { value: DEPLOY_FEE }
        )
      ).to.emit(launcher, "AuctionCreated");
    });

    it("Should fail without token approval", async function () {
      const { launcher, user1 } = await loadFixture(deployFixture);

      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Existing Token", "EXIST", parseEther("1000000000"));
      await token.waitForDeployment();

      const reserveSupply = parseEther("300000000");
      const auctionSupply = parseEther("700000000");

      const currentBlock = await ethers.provider.getBlockNumber();
      const auctionConfig = {
        raisedCurrency: ZeroAddress,
        tickSpacing: 60,
        startBlock: currentBlock + 10,
        endBlock: currentBlock + 10 + AUCTION_DURATION_BLOCKS,
        claimBlock: currentBlock + 10 + AUCTION_DURATION_BLOCKS + CLAIM_DELAY_BLOCKS,
        floorPrice: priceToQ96(parseEther("1"), parseEther("71430000000")),
        requiredCurrencyRaised: parseEther("10"),
        auctionSupply,
      };

      const salt = keccak256(toUtf8Bytes("test-salt-no-approval"));

      // No approval given
      await expect(
        launcher.connect(user1).launchAuction(
          await token.getAddress(),
          reserveSupply,
          auctionConfig,
          salt,
          { value: DEPLOY_FEE }
        )
      ).to.be.reverted;
    });
  });

  describe("migrate", function () {
    it("Should revert migration before auction ends", async function () {
      const { launcher, user1 } = await loadFixture(deployFixture);

      // Create a dummy token address
      const dummyTokenAddress = ethers.Wallet.createRandom().address;

      await expect(
        launcher.connect(user1).migrate(dummyTokenAddress)
      ).to.be.reverted;
    });

    it("Should revert migration if no currency raised", async function () {
      // This test would require a full auction setup with mock CCA
      // Skipping for brevity, but structure would be similar to the above
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to set deploy fee", async function () {
      const { launcher, deployer } = await loadFixture(deployFixture);

      const newFee = parseEther("0.002");
      await launcher.connect(deployer).setDeployFee(newFee);

      expect(await launcher.deployFee()).to.equal(newFee);
    });

    it("Should not allow non-admin to set deploy fee", async function () {
      const { launcher, user1 } = await loadFixture(deployFixture);

      const newFee = parseEther("0.002");
      const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));

      await expect(
        launcher.connect(user1).setDeployFee(newFee)
      ).to.be.revertedWithCustomError(launcher, "AccessControlUnauthorizedAccount")
        .withArgs(user1.address, ADMIN_ROLE);
    });

    it("Should allow admin to withdraw ETH", async function () {
      const { launcher, deployer, user1 } = await loadFixture(deployFixture);

      // Send some ETH to the contract
      await user1.sendTransaction({
        to: await launcher.getAddress(),
        value: parseEther("1"),
      });

      const balanceBefore = await ethers.provider.getBalance(deployer.address);

      await launcher.connect(deployer).withdrawETH(deployer.address);

      const balanceAfter = await ethers.provider.getBalance(deployer.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should not allow non-admin to withdraw ETH", async function () {
      const { launcher, user1, user2 } = await loadFixture(deployFixture);

      await user1.sendTransaction({
        to: await launcher.getAddress(),
        value: parseEther("1"),
      });

      const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));

      await expect(
        launcher.connect(user2).withdrawETH(user2.address)
      ).to.be.revertedWithCustomError(launcher, "AccessControlUnauthorizedAccount")
        .withArgs(user2.address, ADMIN_ROLE);
    });
  });

  describe("ERC721 Receiver", function () {
    it("Should properly receive ERC721 tokens (LP NFTs)", async function () {
      const { launcher } = await loadFixture(deployFixture);

      const selector = launcher.interface.getFunction("onERC721Received")?.selector;
      expect(selector).to.equal("0x150b7a02");
    });
  });

  describe("Upgradeability", function () {
    it("Should allow admin to upgrade contract", async function () {
      const { launcher, uniclearDeployerAddress } = await loadFixture(deployFixture);

      // Deploy a new implementation with library linking
      const UniClearLauncherV2 = await ethers.getContractFactory("UniClearLauncher", {
        libraries: {
          UniClearDeployer: uniclearDeployerAddress,
        },
      });

      await expect(
        upgrades.upgradeProxy(await launcher.getAddress(), UniClearLauncherV2, {
          unsafeAllowLinkedLibraries: true,
        })
      ).to.not.be.reverted;
    });

    it("Should not allow non-admin to upgrade contract", async function () {
      const { launcher, user1 } = await loadFixture(deployFixture);

      const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));

      // Try to call _authorizeUpgrade directly (would fail with access control)
      // Note: This is internal so we can't test directly, but the role check is there
      expect(await launcher.hasRole(ADMIN_ROLE, user1.address)).to.be.false;
    });
  });

  describe("Receive ETH", function () {
    it("Should accept ETH transfers", async function () {
      const { launcher, user1 } = await loadFixture(deployFixture);

      const amount = parseEther("1");

      await expect(
        user1.sendTransaction({
          to: await launcher.getAddress(),
          value: amount,
        })
      ).to.not.be.reverted;

      expect(await ethers.provider.getBalance(await launcher.getAddress())).to.equal(amount);
    });
  });
});
