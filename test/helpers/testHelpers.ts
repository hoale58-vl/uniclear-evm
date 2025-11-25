import { formatEther, parseEther } from "ethers";

/**
 * Test Helper Utilities for UniClearLauncher Tests
 */

// Constants
export const Q96 = 2n ** 96n;
export const RESOLUTION = 96n;
export const MPS = 10n ** 7n;
export const TICK_SPACING = 60n;

/**
 * Convert price to Q96 format aligned with tick spacing
 * @param raisedAmount Amount of currency raised
 * @param tokenAmount Amount of tokens
 * @returns Price in Q96 format
 */
export function priceToQ96(raisedAmount: bigint, tokenAmount: bigint): bigint {
  return (raisedAmount * Q96 / tokenAmount) / TICK_SPACING * TICK_SPACING;
}

/**
 * Convert Q96 price to decimal string
 * @param priceQ96 Price in Q96 format
 * @returns Human-readable price string
 */
export function priceQ96ToDecimal(priceQ96: bigint): string {
  return formatEther(priceQ96 * 10n ** 18n / Q96);
}

/**
 * Format ether with fixed decimals and localization
 * @param value Value to format
 * @param decimals Number of decimal places (default: 3)
 * @param locale Locale for formatting (default: "en-US")
 * @returns Formatted string
 */
export function formatEtherLocalized(
  value: bigint | string,
  decimals: number = 3,
  locale: string = "en-US"
): string {
  const ether = parseFloat(formatEther(value));

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(ether);
}

/**
 * Full multiplication and division with rounding up
 * Used for calculating currency spent and tokens filled
 * @param a First operand
 * @param b Second operand (multiplier)
 * @param denominator Denominator
 * @returns Result rounded up
 */
export function fullMulDivUp(a: bigint, b: bigint, denominator: bigint): bigint {
  const prod = a * b;
  const result = prod / denominator;
  const remainder = prod % denominator;

  if (remainder > 0n) {
    return result + 1n;
  }
  return result;
}

/**
 * Full multiplication and division (rounded down)
 * @param a First operand
 * @param b Second operand (multiplier)
 * @param denominator Denominator
 * @returns Result rounded down
 */
export function fullMulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  return (a * b) / denominator;
}

/**
 * Calculate MPS per price for checkpoint tracking
 * @param deltaMps Change in MPS
 * @param priceQ96 Price in Q96 format
 * @returns MPS per price value
 */
export function getMpsPerPrice(deltaMps: bigint, priceQ96: bigint): bigint {
  if (priceQ96 === 0n) return 0n;
  return (deltaMps << 192n) / priceQ96;
}

/**
 * Generate auction configuration for testing
 * @param currentBlock Current block number
 * @param duration Auction duration in blocks (default: 1000)
 * @param claimDelay Claim delay after auction end (default: 100)
 * @returns Auction configuration object
 */
export function createTestAuctionConfig(
  currentBlock: number,
  duration: number = 1000,
  claimDelay: number = 100
) {
  const startBlock = currentBlock + 10;
  const endBlock = startBlock + duration;
  const claimBlock = endBlock + claimDelay;

  return {
    raisedCurrency: "0x0000000000000000000000000000000000000000", // ETH
    tickSpacing: 60,
    startBlock,
    endBlock,
    claimBlock,
    floorPrice: priceToQ96(parseEther("1"), parseEther("71430000000")),
    requiredCurrencyRaised: parseEther("10"),
    auctionSupply: parseEther("700000000"),
  };
}

/**
 * Generate random bid amount for testing
 * @param min Minimum ETH amount (default: 2)
 * @param max Maximum ETH amount (default: 5)
 * @returns Random amount in ETH
 */
export function randomBidAmount(min: number = 2, max: number = 5): string {
  const amount = Math.random() * (max - min) + min;
  return amount.toFixed(3);
}

/**
 * Generate random price multiplier basis points
 * @param min Minimum BPS (default: 100 = 100% increase)
 * @param max Maximum BPS (default: 200 = 200% increase)
 * @returns Random BPS
 */
export function randomPriceMultiplierBps(min: number = 100, max: number = 200): bigint {
  return BigInt(Math.floor(Math.random() * (max - min + 1)) + min);
}

/**
 * Calculate max price for a bid based on current clearing price
 * @param currentClearingPrice Current clearing price in Q96
 * @param multiplierBps Multiplier in basis points
 * @returns Max price aligned to tick spacing
 */
export function calculateMaxPrice(
  currentClearingPrice: bigint,
  multiplierBps: bigint
): bigint {
  let maxPrice = (currentClearingPrice * (100n + multiplierBps)) / 100n;
  // Align with tick spacing
  maxPrice = (maxPrice / TICK_SPACING) * TICK_SPACING;
  return maxPrice;
}

/**
 * Wait for a specific number of blocks
 * @param blocks Number of blocks to wait
 */
export async function waitBlocks(blocks: number): Promise<void> {
  const { mine } = await import("@nomicfoundation/hardhat-network-helpers");
  await mine(blocks);
}

/**
 * Set balance for an address (useful for testing)
 * @param address Address to fund
 * @param balance Balance in ETH
 */
export async function setBalance(address: string, balance: string): Promise<void> {
  const { ethers } = await import("hardhat");
  await ethers.provider.send("hardhat_setBalance", [
    address,
    "0x" + parseEther(balance).toString(16),
  ]);
}

/**
 * Type definitions for test structures
 */
export interface TestAuctionConfig {
  raisedCurrency: string;
  tickSpacing: number;
  startBlock: number;
  endBlock: number;
  claimBlock: number;
  floorPrice: bigint;
  requiredCurrencyRaised: bigint;
  auctionSupply: bigint;
}

export interface TestTokenConfig {
  name: string;
  symbol: string;
  totalSupply: bigint;
}

export interface TestBidInfo {
  bidId: bigint;
  bidder: string;
  maxPrice: bigint;
  amount: bigint;
  timestamp: number;
}
