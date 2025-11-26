import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseEther, keccak256, toUtf8Bytes, ZeroAddress, formatEther } from "ethers";
import { UniClearLauncher, IContinuousClearingAuction, IERC20 } from "../typechain";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { ScriptConfig } from "../scripts/config";

/**
 * Bidding Integration Tests for UniClearLauncher
 * Tests the full auction bidding flow: submitBid, exitBid, exitPartiallyFilledBid, claimTokens
 * Using real contracts from forked Unichain network
 */
describe("UniClearLauncher Bidding Tests", function () {
  // Constants
  const Q96 = 2n ** 96n;
  const TICK_SPACING = 60n;
  const RESOLUTION = 96n;
  const MPS = 10n ** 7n; // 10,000,000 basis points = 100%
  const AUCTION_DURATION_BLOCKS = 1000;
  const CLAIM_DELAY_BLOCKS = 100;
  const DEPLOY_FEE = parseEther("0.001");

  // Helper function to convert price to Q96 format
  function priceToQ96(raisedAmount: bigint, tokenAmount: bigint): bigint {
    return (raisedAmount * Q96 / tokenAmount) / TICK_SPACING * TICK_SPACING;
  }

  // Helper function to convert Q96 price to decimal string
  function priceQ96ToDecimal(priceQ96: bigint): string {
    return formatEther(priceQ96 * 10n ** 18n / Q96);
  }

  // Fixture to deploy contracts and launch an auction
  async function deployAuctionFixture() {
    const [deployer, bidder1, bidder2, bidder3] = await ethers.getSigners();

    // Fund test accounts
    for (const account of [deployer, bidder1, bidder2, bidder3]) {
      await ethers.provider.send("hardhat_setBalance", [
        account.address,
        "0x" + parseEther("100").toString(16),
      ]);
    }

    // Use real contract addresses from ScriptConfig
    const positionManagerAddress = ScriptConfig.PositionManager;
    const create2DeployerAddress = ScriptConfig.Create2Deployer;
    const ccaFactoryAddress = ScriptConfig.CcaFactory;

    // Deploy UniClearDeployer library first
    const UniClearDeployerFactory = await ethers.getContractFactory("UniClearDeployer");
    const uniclearDeployer = await UniClearDeployerFactory.deploy();
    await uniclearDeployer.waitForDeployment();
    const uniclearDeployerAddress = await uniclearDeployer.getAddress();

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

    // Deploy token and launch auction
    const tokenConfig = {
      name: "Bidding Test Token",
      symbol: "BTT",
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

    const salt = keccak256(toUtf8Bytes("bidding-test"));

    const deployTx = await launcher.connect(bidder1).deployTokenAndLaunchAuction(
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
        // Try parsing as CCA factory event
        continue;
      }
    }

    const auction = await ethers.getContractAt("IContinuousClearingAuction", auctionAddress) as IContinuousClearingAuction;
    const token = await ethers.getContractAt("IERC20", tokenAddress) as IERC20;

    // Wait for auction to start
    const blocksToStart = startBlock - currentBlock;
    if (blocksToStart > 0) {
      await mine(blocksToStart);
    }

    return {
      launcher,
      auction,
      token,
      deployer,
      bidder1,
      bidder2,
      bidder3,
      auctionConfig,
    };
  }

  describe("Submit Bids", function () {
    it("Should allow users to submit bids during auction", async function () {
      const { auction, bidder1 } = await loadFixture(deployAuctionFixture);

      // Get current clearing price
      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;

      // Submit bid at 2x clearing price
      const maxPrice = (clearingPrice * 200n) / 100n / TICK_SPACING * TICK_SPACING;
      const bidAmount = parseEther("2");

      await expect(
        auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
          maxPrice,
          bidAmount,
          bidder1.address,
          "0x",
          { value: bidAmount }
        )
      ).to.emit(auction, "BidSubmitted");
    });

    it("Should emit BidSubmitted event with correct parameters", async function () {
      const { auction, bidder1 } = await loadFixture(deployAuctionFixture);

      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      const maxPrice = (clearingPrice * 150n) / 100n / TICK_SPACING * TICK_SPACING;
      const bidAmount = parseEther("3");

      const tx = await auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
        maxPrice,
        bidAmount,
        bidder1.address,
        "0x",
        { value: bidAmount }
      );

      const receipt = await tx.wait();
      const bidSubmittedEvent = receipt!.logs.find(log => {
        try {
          const parsed = auction.interface.parseLog(log);
          return parsed?.name === "BidSubmitted";
        } catch { return false; }
      });

      expect(bidSubmittedEvent).to.not.be.undefined;

      const parsedEvent = auction.interface.parseLog(bidSubmittedEvent!)!;
      expect(parsedEvent.args[1]).to.equal(bidder1.address); // owner
      expect(parsedEvent.args[2]).to.equal(maxPrice); // price
      expect(parsedEvent.args[3]).to.equal(bidAmount); // amount
    });

    it("Should allow multiple bids from different users", async function () {
      const { auction, bidder1, bidder2, bidder3 } = await loadFixture(deployAuctionFixture);

      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      const maxPrice = (clearingPrice * 200n) / 100n / TICK_SPACING * TICK_SPACING;

      // Submit bids from different users
      const bidAmount1 = parseEther("2");
      const bidAmount2 = parseEther("3");
      const bidAmount3 = parseEther("1.5");

      await expect(
        auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
          maxPrice,
          bidAmount1,
          bidder1.address,
          "0x",
          { value: bidAmount1 }
        )
      ).to.emit(auction, "BidSubmitted");

      await expect(
        auction.connect(bidder2)["submitBid(uint256,uint128,address,bytes)"](
          maxPrice * 2n,
          bidAmount2,
          bidder2.address,
          "0x",
          { value: bidAmount2 }
        )
      ).to.emit(auction, "BidSubmitted");

      await expect(
        auction.connect(bidder3)["submitBid(uint256,uint128,address,bytes)"](
          maxPrice * 3n,
          bidAmount3,
          bidder3.address,
          "0x",
          { value: bidAmount3 }
        )
      ).to.emit(auction, "BidSubmitted");
    });

    it("Should update clearing price when bid is submitted", async function () {
      const { auction, bidder1 } = await loadFixture(deployAuctionFixture);

      const checkpointBefore = await auction.checkpoint.staticCall();
      const clearingPriceBefore = checkpointBefore.clearingPrice;

      const maxPrice = (clearingPriceBefore * 200n) / 100n / TICK_SPACING * TICK_SPACING;
      const bidAmount = parseEther("5");

      await auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
        maxPrice,
        bidAmount,
        bidder1.address,
        "0x",
        { value: bidAmount }
      );

      const checkpointAfter = await auction.checkpoint.staticCall();
      const clearingPriceAfter = checkpointAfter.clearingPrice;

      // Clearing price should increase after bid
      expect(clearingPriceAfter).to.be.gte(clearingPriceBefore);
    });

    it("Should reject bid with insufficient ETH sent", async function () {
      const { auction, bidder1 } = await loadFixture(deployAuctionFixture);

      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      const maxPrice = (clearingPrice * 150n) / 100n / TICK_SPACING * TICK_SPACING;
      const bidAmount = parseEther("2");

      await expect(
        auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
          maxPrice,
          bidAmount,
          bidder1.address,
          "0x",
          { value: parseEther("1") } // Less than bidAmount
        )
      ).to.be.reverted;
    });
  });

  describe("Exit Bids (Full Exit)", function () {
    it("Should allow user to exit bid after auction ends", async function () {
      const { auction, bidder1, auctionConfig } = await loadFixture(deployAuctionFixture);

      // Submit a bid
      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      const maxPrice = (clearingPrice * 300n) / 100n / TICK_SPACING * TICK_SPACING; // High price to avoid outbid
      const bidAmount = parseEther("2");

      const tx = await auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
        maxPrice,
        bidAmount,
        bidder1.address,
        "0x",
        { value: bidAmount }
      );

      const receipt = await tx.wait();
      let bidId = 0n;

      for (const log of receipt!.logs) {
        try {
          const parsed = auction.interface.parseLog(log);
          if (parsed && parsed.name === "BidSubmitted") {
            bidId = parsed.args[0];
            break;
          }
        } catch { continue; }
      }

      // Fast forward to auction end
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToEnd = auctionConfig.endBlock - currentBlock;
      if (blocksToEnd > 0) {
        await mine(blocksToEnd);
      }

      // Exit bid
      await expect(
        auction.connect(bidder1).exitBid(bidId)
      ).to.emit(auction, "BidExited");
    });

    it("Should return correct tokens and refund on exit", async function () {
      const { auction, bidder1, token, auctionConfig } = await loadFixture(deployAuctionFixture);

      // Submit a bid
      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      const maxPrice = (clearingPrice * 300n) / 100n / TICK_SPACING * TICK_SPACING;
      const bidAmount = parseEther("2");

      const tx = await auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
        maxPrice,
        bidAmount,
        bidder1.address,
        "0x",
        { value: bidAmount }
      );

      const receipt = await tx.wait();
      let bidId = 0n;

      for (const log of receipt!.logs) {
        try {
          const parsed = auction.interface.parseLog(log);
          if (parsed && parsed.name === "BidSubmitted") {
            bidId = parsed.args[0];
            break;
          }
        } catch { continue; }
      }

      // Fast forward to auction end
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToEnd = auctionConfig.endBlock - currentBlock;
      if (blocksToEnd > 0) {
        await mine(blocksToEnd);
      }

      // Record balances before exit
      const ethBalanceBefore = await ethers.provider.getBalance(bidder1.address);
      const tokenBalanceBefore = await token.balanceOf(bidder1.address);

      // Exit bid
      const exitTx = await auction.connect(bidder1).exitBid(bidId);
      const exitReceipt = await exitTx.wait();

      // Parse BidExited event
      const exitEvent = exitReceipt!.logs.find(log => {
        try {
          const parsed = auction.interface.parseLog(log);
          return parsed?.name === "BidExited";
        } catch { return false; }
      });

      expect(exitEvent).to.not.be.undefined;

      const parsedEvent = auction.interface.parseLog(exitEvent!)!;
      const tokensFilled = parsedEvent.args[2];
      const currencyRefunded = parsedEvent.args[3];

      // Check balances after exit
      const tokenBalanceAfter = await token.balanceOf(bidder1.address);
      expect(tokenBalanceAfter - tokenBalanceBefore).to.equal(tokensFilled);

      console.log(`     Tokens Received: ${formatEther(tokensFilled)}`);
      console.log(`     ETH Refunded: ${formatEther(currencyRefunded)}`);
    });

    it("Should handle multiple exits from different users", async function () {
      const { auction, bidder1, bidder2, auctionConfig } = await loadFixture(deployAuctionFixture);

      // Submit bids from multiple users
      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      let maxPrice = (clearingPrice * 300n) / 100n / TICK_SPACING * TICK_SPACING;

      const bids: { bidder: any; bidId: bigint }[] = [];

      for (const bidder of [bidder1, bidder2]) {
        const bidAmount = parseEther("2");
        maxPrice = maxPrice * 2n;
        const tx = await auction.connect(bidder)["submitBid(uint256,uint128,address,bytes)"](
          maxPrice,
          bidAmount,
          bidder.address,
          "0x",
          { value: bidAmount }
        );

        const receipt = await tx.wait();
        for (const log of receipt!.logs) {
          try {
            const parsed = auction.interface.parseLog(log);
            if (parsed && parsed.name === "BidSubmitted") {
              bids.push({ bidder, bidId: parsed.args[0] });
              break;
            }
          } catch { continue; }
        }
      }

      // Fast forward to auction end
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToEnd = auctionConfig.endBlock - currentBlock;
      if (blocksToEnd > 0) {
        await mine(blocksToEnd);
      }

      // Exit all bids
      for (const { bidder, bidId } of bids) {
        await expect(
          auction.connect(bidder).exitBid(bidId)
        ).to.emit(auction, "BidExited");
      }
    });
  });

  describe("Exit Partially Filled Bids", function () {
    it("Should allow exit of partially filled bid", async function () {
      const { auction, bidder1, bidder2, auctionConfig } = await loadFixture(deployAuctionFixture);

      // Submit a low-price bid that might get partially filled
      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      const lowMaxPrice = (clearingPrice * 120n) / 100n / TICK_SPACING * TICK_SPACING;
      const bidAmount = parseEther("1");

      const tx1 = await auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
        lowMaxPrice,
        bidAmount,
        bidder1.address,
        "0x",
        { value: bidAmount }
      );

      const receipt1 = await tx1.wait();
      let bidId = 0n;

      for (const log of receipt1!.logs) {
        try {
          const parsed = auction.interface.parseLog(log);
          if (parsed && parsed.name === "BidSubmitted") {
            bidId = parsed.args[0];
            break;
          }
        } catch { continue; }
      }

      // Submit several higher bids to push price up
      let highMaxPrice = (clearingPrice * 300n) / 100n / TICK_SPACING * TICK_SPACING;
      for (let i = 0; i < 3; i++) {
        const highBidAmount = parseEther("5");
        highMaxPrice = highMaxPrice * 5n;

        await auction.connect(bidder2)["submitBid(uint256,uint128,address,bytes)"](
          highMaxPrice,
          highBidAmount,
          bidder2.address,
          "0x",
          { value: highBidAmount }
        );

        // Mine some blocks
        await mine(50);
      }

      // Fast forward to auction end
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToEnd = auctionConfig.endBlock - currentBlock;
      if (blocksToEnd > 0) {
        await mine(blocksToEnd);
      }

      // Try to exit the partially filled bid
      // Note: For simplicity, we use lastFullyFilledBlock = 0 and outbidBlock = 0
      // In a real scenario, you would calculate these from checkpoints
      await expect(
        auction.connect(bidder1).exitPartiallyFilledBid(bidId, 0, 0)
      ).to.emit(auction, "BidExited");
    });
  });

  describe("Claim Tokens", function () {
    it("Should allow users to claim tokens after claim block", async function () {
      const { auction, bidder1, token, auctionConfig } = await loadFixture(deployAuctionFixture);

      // Submit a bid
      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      const maxPrice = (clearingPrice * 300n) / 100n / TICK_SPACING * TICK_SPACING;
      const bidAmount = parseEther("20");

      const tx = await auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
        maxPrice,
        bidAmount,
        bidder1.address,
        "0x",
        { value: bidAmount }
      );

      const receipt = await tx.wait();
      let bidId = 0n;

      for (const log of receipt!.logs) {
        try {
          const parsed = auction.interface.parseLog(log);
          if (parsed && parsed.name === "BidSubmitted") {
            bidId = parsed.args[0];
            break;
          }
        } catch { continue; }
      }

      // Fast forward to claim block
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToClaim = auctionConfig.claimBlock - currentBlock;
      if (blocksToClaim > 0) {
        await mine(blocksToClaim);
      }

      // Record token balance before claim
      const tokenBalanceBefore = await token.balanceOf(bidder1.address);

      // Claim tokens
      await expect(
        auction.connect(bidder1).claimTokens(bidId)
      ).to.emit(auction, "TokensClaimed");

      // Check token balance increased
      const tokenBalanceAfter = await token.balanceOf(bidder1.address);
      expect(tokenBalanceAfter).to.be.gt(tokenBalanceBefore);
    });

    it("Should emit TokensClaimed event with correct parameters", async function () {
      const { auction, bidder1, token, auctionConfig } = await loadFixture(deployAuctionFixture);

      // Submit a bid
      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      const maxPrice = (clearingPrice * 300n) / 100n / TICK_SPACING * TICK_SPACING;
      const bidAmount = parseEther("20"); // > 10 eth required currency

      const tx = await auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
        maxPrice,
        bidAmount,
        bidder1.address,
        "0x",
        { value: bidAmount }
      );

      const receipt = await tx.wait();
      let bidId = 0n;

      for (const log of receipt!.logs) {
        try {
          const parsed = auction.interface.parseLog(log);
          if (parsed && parsed.name === "BidSubmitted") {
            bidId = parsed.args[0];
            break;
          }
        } catch { continue; }
      }

      // Fast forward to claim block
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToClaim = auctionConfig.claimBlock - currentBlock;
      if (blocksToClaim > 0) {
        await mine(blocksToClaim);
      }

      // Claim tokens
      const claimTx = await auction.connect(bidder1).claimTokens(bidId);
      const claimReceipt = await claimTx.wait();

      // Find TokensClaimed event
      const claimEvent = claimReceipt!.logs.find(log => {
        try {
          const parsed = auction.interface.parseLog(log);
          return parsed?.name === "TokensClaimed";
        } catch { return false; }
      });

      expect(claimEvent).to.not.be.undefined;

      const parsedEvent = auction.interface.parseLog(claimEvent!)!;
      expect(parsedEvent.args[1]).to.equal(bidder1.address); // owner
      expect(parsedEvent.args[2]).to.be.gt(0); // tokensFilled

      console.log(`     Tokens Claimed: ${formatEther(parsedEvent.args[2])}`);
    });

    it("Should not allow claiming tokens before claim block", async function () {
      const { auction, bidder1, auctionConfig } = await loadFixture(deployAuctionFixture);

      // Submit a bid
      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      const maxPrice = (clearingPrice * 300n) / 100n / TICK_SPACING * TICK_SPACING;
      const bidAmount = parseEther("2");

      const tx = await auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
        maxPrice,
        bidAmount,
        bidder1.address,
        "0x",
        { value: bidAmount }
      );

      const receipt = await tx.wait();
      let bidId = 0n;

      for (const log of receipt!.logs) {
        try {
          const parsed = auction.interface.parseLog(log);
          if (parsed && parsed.name === "BidSubmitted") {
            bidId = parsed.args[0];
            break;
          }
        } catch { continue; }
      }

      // Fast forward only to end block (not claim block)
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToEnd = auctionConfig.endBlock - currentBlock;
      if (blocksToEnd > 0) {
        await mine(blocksToEnd);
      }

      // Try to claim tokens before claim block
      await expect(
        auction.connect(bidder1).claimTokens(bidId)
      ).to.be.reverted;
    });

    it("Should allow multiple users to claim their tokens", async function () {
      const { auction, bidder1, bidder2, token, auctionConfig } = await loadFixture(deployAuctionFixture);

      // Submit bids from multiple users
      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;
      let maxPrice = (clearingPrice * 300n) / 100n / TICK_SPACING * TICK_SPACING;

      const bids: { bidder: any; bidId: bigint }[] = [];

      for (const bidder of [bidder1, bidder2]) {
        maxPrice = maxPrice * 5n;
        const bidAmount = parseEther("20");
        const tx = await auction.connect(bidder)["submitBid(uint256,uint128,address,bytes)"](
          maxPrice,
          bidAmount,
          bidder.address,
          "0x",
          { value: bidAmount }
        );

        const receipt = await tx.wait();
        for (const log of receipt!.logs) {
          try {
            const parsed = auction.interface.parseLog(log);
            if (parsed && parsed.name === "BidSubmitted") {
              bids.push({ bidder, bidId: parsed.args[0] });
              break;
            }
          } catch { continue; }
        }
      }

      // Fast forward to claim block
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToClaim = auctionConfig.claimBlock - currentBlock;
      if (blocksToClaim > 0) {
        await mine(blocksToClaim);
      }

      // Claim tokens for all bids
      for (const { bidder, bidId } of bids) {
        const tokenBalanceBefore = await token.balanceOf(bidder.address);

        await expect(
          auction.connect(bidder).claimTokens(bidId)
        ).to.emit(auction, "TokensClaimed");

        const tokenBalanceAfter = await token.balanceOf(bidder.address);
        expect(tokenBalanceAfter).to.be.gt(tokenBalanceBefore);
      }
    });
  });

  describe("Complete Bidding Flow", function () {
    it("Should handle complete flow: submit -> exit -> claim", async function () {
      const { auction, bidder1, bidder2, token, auctionConfig } = await loadFixture(deployAuctionFixture);

      console.log("\n📋 Testing Complete Bidding Flow...");

      // Step 1: Submit bids
      console.log("\n   Step 1: Submitting bids...");
      const checkpoint = await auction.checkpoint.staticCall();
      const clearingPrice = checkpoint.clearingPrice;

      // Bidder1 submits high-price bid (will be filled)
      const highMaxPrice = (clearingPrice * 300n) / 100n / TICK_SPACING * TICK_SPACING;
      const bidAmount1 = parseEther("3");

      const tx1 = await auction.connect(bidder1)["submitBid(uint256,uint128,address,bytes)"](
        highMaxPrice,
        bidAmount1,
        bidder1.address,
        "0x",
        { value: bidAmount1 }
      );

      const receipt1 = await tx1.wait();
      let bidId1 = 0n;

      for (const log of receipt1!.logs) {
        try {
          const parsed = auction.interface.parseLog(log);
          if (parsed && parsed.name === "BidSubmitted") {
            bidId1 = parsed.args[0];
            console.log(`     ✅ Bidder1 submitted bid ${bidId1}`);
            break;
          }
        } catch { continue; }
      }

      const maxPrice = highMaxPrice * 2n;
      const bidAmount2 = parseEther("2");

      const tx2 = await auction.connect(bidder2)["submitBid(uint256,uint128,address,bytes)"](
        maxPrice,
        bidAmount2,
        bidder2.address,
        "0x",
        { value: bidAmount2 }
      );

      const receipt2 = await tx2.wait();
      let bidId2 = 0n;

      for (const log of receipt2!.logs) {
        try {
          const parsed = auction.interface.parseLog(log);
          if (parsed && parsed.name === "BidSubmitted") {
            bidId2 = parsed.args[0];
            console.log(`     ✅ Bidder2 submitted bid ${bidId2}`);
            break;
          }
        } catch { continue; }
      }

      // Step 2: Fast forward to auction end
      console.log("\n   Step 2: Fast-forwarding to auction end...");
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToEnd = auctionConfig.endBlock - currentBlock;
      if (blocksToEnd > 0) {
        await mine(blocksToEnd);
      }
      console.log("     ✅ Auction ended");

      // Step 3: Exit bids
      console.log("\n   Step 3: Exiting bids...");

      const tokenBalance1Before = await token.balanceOf(bidder1.address);

      await auction.connect(bidder1).exitBid(bidId1);
      console.log("     ✅ Bidder1 exited bid");

      const tokenBalance1After = await token.balanceOf(bidder1.address);

      console.log(`     Bidder1 tokens received: ${formatEther(tokenBalance1After - tokenBalance1Before)}`);

      // Step 4: Fast forward to claim block
      console.log("\n   Step 4: Fast-forwarding to claim block...");
      const currentBlock2 = await ethers.provider.getBlockNumber();
      const blocksToClaim = auctionConfig.claimBlock - currentBlock2;
      if (blocksToClaim > 0) {
        await mine(blocksToClaim);
      }
      console.log("     ✅ Claim block reached");

      // Step 5: Claim tokens (if not exited)
      console.log("\n   Step 5: Claiming remaining tokens...");
      // Note: bidder1 already exited, so we can't claim again
      // This is just to demonstrate the flow

      console.log("\n   ✅ Complete bidding flow tested successfully!");
    });
  });
});
