# Post-Auction Scenarios and Configuration Impact

## Scenarios After Auction Success

### Scenario 1: Exact Match (Rare)
**Condition**: `currencyRaised * clearingPrice == reserveSupply`

**What happens:**
- All reserve supply used for full range position
- No leftover currency
- No one-sided positions created
- `initialTokenAmount = reserveSupply`
- `leftoverCurrency = 0`

**Code path:**
```solidity
// In TokenPricing.calculateAmounts()
tokenAmountUint256 = currencyRaised * clearingPrice
// If tokenAmountUint256 == reserveSupply (exactly):
tokenAmount = reserveSupply
leftoverCurrency = 0
correspondingCurrencyAmount = currencyRaised
```

### Scenario 2: More Currency Than Needed (Common)
**Condition**: `currencyRaised * clearingPrice > reserveSupply`

**What happens:**
- All reserve supply consumed
- Leftover currency remains
- Potential one-sided currency position

**Calculation:**
```solidity
// Token amount needed exceeds reserve
tokenAmountUint256 (calculated) > reserveSupply

// Recalculate based on reserve limit
correspondingCurrencyAmount = reserveSupply / clearingPrice
leftoverCurrency = currencyRaised - correspondingCurrencyAmount

// Results:
tokenAmount = reserveSupply (capped)
```

**In LBPStrategyBasic:**
- If `createOneSidedCurrencyPosition = true`:
  - Creates one-sided position with `leftoverCurrency`
  - Range: above current price
- If `createOneSidedCurrencyPosition = false`:
  - Leftover currency remains in contract
  - Can be swept by operator after sweepBlock

**In UniClearLauncher:**
- Leftover currency remains in contract (no one-sided positions)
- Can be withdrawn by admin

### Scenario 3: Less Currency Than Reserve (Common)
**Condition**: `currencyRaised * clearingPrice < reserveSupply`

**What happens:**
- Not all reserve supply used
- Leftover tokens remain
- Potential one-sided token position

**Calculation:**
```solidity
// Token amount needed is less than reserve
tokenAmountUint256 < reserveSupply

// Results:
tokenAmount = tokenAmountUint256
leftoverCurrency = 0
correspondingCurrencyAmount = currencyRaised

// Remaining tokens:
remainingTokens = reserveSupply - tokenAmount
```

**In LBPStrategyBasic:**
- If `createOneSidedTokenPosition = true`:
  - Creates one-sided position with remaining tokens
  - Range: below current price
- If `createOneSidedTokenPosition = false`:
  - Remaining tokens stay in contract
  - Can be swept by operator after sweepBlock

**In UniClearLauncher:**
- Remaining tokens stay in contract (no one-sided positions)
- Can be swept by admin

## Is MigratorParameters Needed in UniClearLauncher?

### Short Answer: NO

UniClearLauncher does NOT use `MigratorParameters`. Instead, it uses:
1. `AuctionConfig` for auction setup
2. `AuctionInfo` for storing auction data
3. Hardcoded constants for pool configuration

### What UniClearLauncher Uses Instead:

```solidity
// Hardcoded in UniClearLauncher
uint24 public constant POOL_FEE = 100; // 0.01%
int24 public constant POOL_TICK_SPACING = 1;
address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

// From AuctionInfo (stored per token)
struct AuctionInfo {
    IContinuousClearingAuction auction;
    address raisedCurrency;  // Instead of MigratorParameters.currency
    uint128 reserveSupply;   // Calculated, not from parameter
    uint64 endBlock;         // For migration timing
}

// No operator, no sweep block, no one-sided position flags
```

### Migration Parameters Comparison:

| Parameter | LBPStrategyBasic (MigratorParameters) | UniClearLauncher |
|-----------|--------------------------------------|------------------|
| `migrationBlock` | User configurable | `endBlock + 1` (calculated) |
| `currency` | From parameter | From AuctionConfig.raisedCurrency |
| `poolLPFee` | From parameter | Hardcoded: `100` (0.01%) |
| `poolTickSpacing` | From parameter | Hardcoded: `1` |
| `tokenSplitToAuction` | From parameter | Calculated from reserveSupply |
| `auctionFactory` | From parameter | Stored in `ccaFactory` |
| `positionRecipient` | From parameter | Hardcoded: `DEAD_ADDRESS` |
| `sweepBlock` | From parameter | Not used |
| `operator` | From parameter | Not used (admin role instead) |
| `createOneSidedTokenPosition` | From parameter | Hardcoded: `false` |
| `createOneSidedCurrencyPosition` | From parameter | Hardcoded: `false` |

## How createOneSidedTokenPosition and createOneSidedCurrencyPosition Affect Migration

### In LBPStrategyBasic:

#### createOneSidedTokenPosition = true
**When it triggers:**
```solidity
reserveSupply > initialTokenAmount
```

**What it does:**
1. Calculates remaining tokens: `reserveSupply - initialTokenAmount`
2. Creates one-sided position below current price
3. Range: `[minUsableTick, currentTick)`
4. Uses ALL remaining tokens

**Capital efficiency benefit:**
- Provides liquidity for price decreases
- No currency needed for this position
- Earns fees when price drops

**Code path:**
```solidity
// In _prepareMigrationData()
data.shouldCreateOneSided = createOneSidedTokenPosition && reserveSupply > data.initialTokenAmount

// In _createPositionPlan()
if (data.shouldCreateOneSided) {
    // Creates 8-param plan (full range + one-sided)
    _createOneSidedPositionPlan(amount: reserveSupply - initialTokenAmount, inToken: true)
}
```

#### createOneSidedCurrencyPosition = true
**When it triggers:**
```solidity
leftoverCurrency > 0
```
(This happens when clearing price requires less than all reserve supply)

**What it does:**
1. Uses leftover currency
2. Creates one-sided position above current price
3. Range: `(currentTick, maxUsableTick]`
4. Uses ALL leftover currency

**Capital efficiency benefit:**
- Provides liquidity for price increases
- No tokens needed for this position
- Earns fees when price rises

**Code path:**
```solidity
// In _prepareMigrationData()
data.shouldCreateOneSided = createOneSidedCurrencyPosition && data.leftoverCurrency > 0

// In _createPositionPlan()
if (data.shouldCreateOneSided) {
    // Creates 8-param plan (full range + one-sided)
    _createOneSidedPositionPlan(amount: leftoverCurrency, inToken: false)
}
```

#### Both = true (Most Common Configuration)
```solidity
data.shouldCreateOneSided =
    (createOneSidedTokenPosition && reserveSupply > initialTokenAmount) ||
    (createOneSidedCurrencyPosition && leftoverCurrency > 0)
```

**Result**: Creates whichever one-sided position is needed based on actual amounts

**Validation checks before creating:**
1. Tick bounds not too close to MIN_TICK/MAX_TICK
2. Calculated liquidity > 0
3. Total liquidity doesn't exceed `maxLiquidityPerTick`

If validation fails, falls back to full range only.

#### Both = false
- Only full range position created
- Leftover tokens/currency stay in contract
- Can be swept by operator after sweepBlock

### In UniClearLauncher:

**Hardcoded behavior:**
```solidity
// These are effectively always false
createOneSidedTokenPosition = false
createOneSidedCurrencyPosition = false
```

**Result:**
- ONLY full range position is ever created
- Uses exactly `initialTokenAmount` and `initialCurrencyAmount`
- Any leftover tokens or currency stays in contract
- Can be withdrawn by admin via `withdrawETH()` (for native) or sweep functions

## Summary Table

| Scenario | Leftover Asset | LBP (one-sided=true) | LBP (one-sided=false) | UniClearLauncher |
|----------|---------------|---------------------|----------------------|------------------|
| Exact match | None | Full range only | Full range only | Full range only |
| Excess currency | Currency | Full + currency one-sided | Full range, sweep currency | Full range, admin withdraw |
| Excess tokens | Tokens | Full + token one-sided | Full range, sweep tokens | Full range, admin withdraw |

**Key Insight**: The one-sided position flags maximize capital efficiency by deploying all available assets into liquidity positions, rather than leaving them idle in the contract.
