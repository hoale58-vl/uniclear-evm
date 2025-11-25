import { keccak256, AbiCoder } from "ethers";

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toPoolId(token0: string, token1: string, fee: Number, tickSpacing: Number, hooks: string) {
  if (token0.toLowerCase() > token1.toLowerCase()) {
    [token0, token1] = [token1, token0];
  }
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint24", "int24", "address"],
    [token0, token1, fee, tickSpacing, hooks]
  );

  return keccak256(encoded);
}

export function fullMulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  return (a * b) / denominator;
}

/** mulDiv that rounds UP when remainder > 0 */
export function fullMulDivUp(a: bigint, b: bigint, denominator: bigint): bigint {
  const prod = a * b;
  const result = prod / denominator;
  if (prod % denominator === 0n) return result;
  return result + 1n;
}