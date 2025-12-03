# UniClearLauncher vs LiquidityLauncher Contracts

## Architecture Comparison

### LiquidityLauncher System (liquidity-launcher)
The liquidity-launcher is a **flexible framework** with multiple components:

1. **LiquidityLauncher.sol** (Main Entry Point)
   - Generic launcher that works with any distribution strategy
   - Supports token creation via factories
   - Supports multiple distribution strategies (Merkle claims, LBP, etc.)
   - Uses Permit2 for token transfers
   - Multicall support for batching operations

2. **LBPStrategyBasic.sol** (Distribution Contract)
   - One specific strategy for liquidity bootstrapping
   - Manages auction creation and migration to Uniswap v4
   - Configurable via `MigratorParameters`
   - Supports multiple position types (full range + optional one-sided)

3. **Design Pattern**: Strategy Pattern
   - `IDistributionStrategy` interface allows pluggable distribution methods
   - Can easily add new distribution types (Merkle claims, vesting, etc.)

### UniClearLauncher (Your Contract)
A **specialized, opinionated** launcher:

1. **UniClearLauncher.sol** (All-in-One)
   - Specifically designed for continuous clearing auctions
   - Direct integration with ContinuousClearingAuction
   - Simplified, fixed migration strategy
   - No external distribution strategies needed

2. **Design Pattern**: Monolithic
   - Self-contained implementation
   - Hardcoded behavior for one specific use case

## Key Differences

### 1. Flexibility
| Feature | LiquidityLauncher | UniClearLauncher |
|---------|------------------|------------------|
| Distribution strategies | Multiple (pluggable) | Single (hardcoded) |
| Migration positions | 1-3 positions (configurable) | 1 position (fixed) |
| LP recipient | Configurable | DEAD_ADDRESS (burned) |
| Token split to auction | Configurable via parameter | Fixed in code |
| Sweep functionality | Yes (with operator) | Yes (admin only) |

### 2. Parameters Usage

**LBPStrategyBasic uses MigratorParameters:**
```solidity
struct MigratorParameters {
    uint64 migrationBlock;
    address currency;
    uint24 poolLPFee;
    int24 poolTickSpacing;
    uint24 tokenSplitToAuction;        // Configurable split
    address auctionFactory;
    address positionRecipient;          // Configurable recipient
    uint64 sweepBlock;
    address operator;
    bool createOneSidedTokenPosition;   // Optional feature
    bool createOneSidedCurrencyPosition; // Optional feature
}
```

**UniClearLauncher uses AuctionConfig (implicit):**
```solidity
struct AuctionConfig {
    address raisedCurrency;
    uint64 startBlock;
    uint64 endBlock;
    uint64 claimBlock;
    int24 tickSpacing;
    uint256 floorPrice;
    uint128 requiredCurrencyRaised;
    uint128 auctionSupply;              // Fixed supply
}
```

**What UniClearLauncher Doesn't Use from MigratorParameters:**
- `tokenSplitToAuction` - Calculated differently
- `createOneSidedTokenPosition` - Not supported
- `createOneSidedCurrencyPosition` - Not supported
- `positionRecipient` - Hardcoded to DEAD_ADDRESS
- `operator` - Uses admin role instead
- `sweepBlock` - No sweep functionality beyond admin controls

### 3. Code Reuse

**UniClearLauncher borrows/reuses:**
- ✅ `StrategyPlanner` library (same code path)
- ✅ `TokenPricing` library (same calculations)
- ✅ `BasePositionParams` and `FullRangeParams` types
- ✅ Migration data preparation logic
- ✅ Price calculation and conversion logic

**UniClearLauncher does NOT use:**
- ❌ `MigratorParameters` struct
- ❌ `OneSidedParams` (no one-sided positions)
- ❌ LiquidityLauncher's multicall pattern
- ❌ Permit2 integration
- ❌ Distribution strategy pattern
- ❌ Operator-based sweep mechanism

### 4. Migration Flow Comparison

**LBPStrategyBasic Migration:**
```
1. Validate migration (timing + currency balance)
2. Prepare migration data (price, amounts, liquidity)
3. Initialize pool
4. Create position plan:
   a. Full range position
   b. Optional one-sided token position
   c. Optional one-sided currency position
   d. Final take pair
5. Transfer assets and execute plan
6. LP tokens → positionRecipient
```

**UniClearLauncher Migration:**
```
1. Sweep currency from auction
2. Sweep unsold tokens from auction
3. Validate migration (timing + currency balance)
4. Prepare migration data (price, amounts, liquidity)
5. Initialize pool
6. Create position plan:
   a. Full range position ONLY
   b. Final take pair
7. Transfer assets and execute plan
8. LP tokens → DEAD_ADDRESS (burned)
```

### 5. Access Control

**LBPStrategyBasic:**
- `migrate()`: Anyone can call after migrationBlock
- `sweepToken()`: Only operator, after sweepBlock
- `sweepCurrency()`: Only operator, after sweepBlock

**UniClearLauncher:**
- `migrate()`: Anyone can call after endBlock + 1
- `withdrawETH()`: Only ADMIN_ROLE
- `setDeployFee()`: Only ADMIN_ROLE
- Upgradeable via UUPS pattern

## When to Use Which?

### Use LiquidityLauncher + LBPStrategyBasic when:
- You need flexibility in distribution strategies
- You want to keep LP tokens or distribute them
- You want optional one-sided positions for better capital efficiency
- You need operator-controlled sweep functionality
- You want to support multiple distribution methods (LBP, Merkle, etc.)

### Use UniClearLauncher when:
- You want a simple, opinionated launcher
- You want to permanently lock liquidity (burn LP tokens)
- You don't need one-sided positions
- You prefer a monolithic, easy-to-audit contract
- You want admin-controlled upgradability
