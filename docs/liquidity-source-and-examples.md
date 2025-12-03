# Liquidity Source and Migration Examples

## Where Does Liquidity Come From for Migration?

### The Source: RESERVE Supply (NOT Auction Remainder)

**Critical Understanding:**

The liquidity migration uses **RESERVE SUPPLY**, which is:
- Tokens that were **NEVER sent to the auction**
- Held by the launcher contract from the beginning
- Separate from auction tokens

**NOT used for migration:**
- Unsold auction tokens (if any)
- Tokens bought during auction (those go to bidders)

### Token Flow Diagram

```
Total Supply: 100B tokens
        |
        v
    [Deployed]
        |
        +---> Split into two parts:
        |
        +---> Auction Supply (e.g., 50B)
        |     - Sent to auction contract
        |     - Distributed to bidders
        |     - Unsold tokens swept back (if any)
        |
        +---> Reserve Supply (e.g., 50B)
              - Held in launcher contract
              - USED FOR LIQUIDITY MIGRATION
              - Never touched by auction
```

## Example: 100B Total Supply Token Launch

### Configuration

**Token Details:**
- Name: "MemeToken"
- Symbol: "MEME"
- Total Supply: 100,000,000,000 (100B)

**LBPStrategyBasic Configuration:**
```solidity
MigratorParameters {
    tokenSplitToAuction: 5e6,  // 50% (5,000,000 / 10,000,000)
    currency: USDC,
    migrationBlock: 1000000,
    poolLPFee: 3000,           // 0.3%
    poolTickSpacing: 60,
    createOneSidedTokenPosition: true,
    createOneSidedCurrencyPosition: true,
    positionRecipient: 0x1234...
}
```

**Calculation:**
```solidity
totalSupply = 100,000,000,000 tokens
tokenSplitToAuction = 5e6 (50%)

auctionSupply = 100B * 5e6 / 1e7 = 50,000,000,000 tokens (50B)
reserveSupply = 100B - 50B = 50,000,000,000 tokens (50B)
```

**Distribution:**
- **Auction gets**: 50B tokens → distributed to bidders
- **Reserve held**: 50B tokens → used for liquidity migration

### Scenario A: High Demand Auction (Excess Currency)

**Auction Results:**
- Currency raised: 500,000 USDC
- Final clearing price: 0.00002 USDC per token (1 token = 0.00002 USDC)
- All 50B auction tokens sold

**Migration Calculation:**

```solidity
// Step 1: Calculate how many tokens needed for full range at clearing price
clearingPrice = 0.00002 USDC per token
currencyRaised = 500,000 USDC

// How many tokens would 500k USDC buy at clearing price?
tokenAmountNeeded = 500,000 / 0.00002 = 25,000,000,000 tokens (25B)

// Step 2: Compare with reserve
reserveSupply = 50B tokens

// tokenAmountNeeded (25B) < reserveSupply (50B)
// ∴ We have EXCESS TOKENS
```

**Migration Execution:**

1. **Full Range Position:**
   - Token amount: 25B tokens
   - Currency amount: 500,000 USDC
   - Range: Full range (all ticks)
   - Price: Set at clearing price (0.00002 USDC per token)

2. **One-Sided Token Position:**
   - Triggered: YES (`reserveSupply > initialTokenAmount`)
   - Token amount: 50B - 25B = 25,000,000,000 tokens (25B)
   - Currency amount: 0 USDC
   - Range: Below current price
   - Provides liquidity for price decreases

**Final Result:**
- Total liquidity deployed: 50B tokens + 500k USDC
- Two positions created (full range + one-sided token)
- LP tokens sent to: 0x1234...
- Auction tokens: 50B distributed to bidders
- Reserve tokens: 50B in liquidity (0 left over)

### Scenario B: Low Demand Auction (Excess Tokens in Reserve)

**Auction Results:**
- Currency raised: 200,000 USDC
- Final clearing price: 0.00001 USDC per token
- All 50B auction tokens sold

**Migration Calculation:**

```solidity
clearingPrice = 0.00001 USDC per token
currencyRaised = 200,000 USDC

tokenAmountNeeded = 200,000 / 0.00001 = 20,000,000,000 tokens (20B)
reserveSupply = 50B tokens

// tokenAmountNeeded (20B) < reserveSupply (50B)
// ∴ EXCESS TOKENS: 30B
```

**Migration Execution:**

1. **Full Range Position:**
   - Token amount: 20B tokens
   - Currency amount: 200,000 USDC
   - Range: Full range

2. **One-Sided Token Position:**
   - Token amount: 30B tokens
   - Currency amount: 0 USDC
   - Range: Below current price

**Final Result:**
- Liquidity: 50B tokens + 200k USDC
- Auction distributed: 50B tokens
- Total in circulation: 100B tokens
- All reserve used

### Scenario C: Very High Demand (Excess Currency)

**Auction Results:**
- Currency raised: 1,000,000 USDC
- Final clearing price: 0.00003 USDC per token
- All 50B auction tokens sold

**Migration Calculation:**

```solidity
clearingPrice = 0.00003 USDC per token
currencyRaised = 1,000,000 USDC

// How many tokens needed at this price?
tokenAmountNeeded = 1,000,000 / 0.00003 = 33,333,333,333 tokens (33.33B)

reserveSupply = 50B tokens

// tokenAmountNeeded (33.33B) < reserveSupply (50B)
// Still have excess tokens! Let's try another price...

// Actually, the algorithm works differently:
// It checks if calculated amount > reserve

// Since 33.33B < 50B, we use 33.33B tokens
// But wait - let me recalculate for when currency is excess...

// If price is such that currency can buy MORE than reserve:
tokenAmountWouldNeed = 1,000,000 / 0.00003 = 33.33B
// This is LESS than reserve (50B)

// For EXCESS CURRENCY scenario, price must be higher
// Let's say clearing price = 0.00001 USDC per token

tokenAmountNeeded = 1,000,000 / 0.00001 = 100,000,000,000 tokens (100B)
reserveSupply = 50B tokens

// tokenAmountNeeded (100B) > reserveSupply (50B)
// ∴ We have EXCESS CURRENCY
```

**With clearing price = 0.00001 USDC per token:**

```solidity
// Recalculate currency needed for reserve
correspondingCurrencyAmount = 50B * 0.00001 = 500,000 USDC
leftoverCurrency = 1,000,000 - 500,000 = 500,000 USDC
```

**Migration Execution:**

1. **Full Range Position:**
   - Token amount: 50B tokens (all reserve)
   - Currency amount: 500,000 USDC
   - Range: Full range

2. **One-Sided Currency Position:**
   - Triggered: YES (`leftoverCurrency > 0`)
   - Token amount: 0 tokens
   - Currency amount: 500,000 USDC
   - Range: Above current price
   - Provides liquidity for price increases

**Final Result:**
- Liquidity: 50B tokens + 1,000,000 USDC
- Auction distributed: 50B tokens
- All reserve used
- All currency deployed

### UniClearLauncher Scenario (Same Setup)

**Configuration:**
```solidity
TokenConfig {
    totalSupply: 100,000,000,000 (100B)
}

AuctionConfig {
    auctionSupply: 50,000,000,000 (50B)
    // reserveSupply calculated as: totalSupply - auctionSupply = 50B
}
```

**With Scenario A results (500k USDC raised, 0.00002 price):**

1. **Full Range Position ONLY:**
   - Token amount: 25B tokens
   - Currency amount: 500,000 USDC
   - Range: Full range
   - LP recipient: `DEAD_ADDRESS` (burned)

2. **Leftover Assets:**
   - Tokens: 25B (stays in contract)
   - Can be swept by admin

**Key Difference:** UniClearLauncher doesn't create one-sided positions, leaving 25B tokens unutilized in the contract.

## Summary: Liquidity Source

| Component | Source | Amount (100B example) | Purpose |
|-----------|--------|----------------------|---------|
| **Auction tokens** | Sent to auction | 50B | Distributed to bidders |
| **Reserve tokens** | Held in launcher | 50B | **LIQUIDITY MIGRATION** |
| **Raised currency** | From bidders | Varies | **LIQUIDITY MIGRATION** |
| **Unsold auction tokens** | Swept from auction | 0 (if sold out) | Returned to launcher |

### The Key Point:

**Liquidity comes from:**
1. ✅ **Reserve supply** (tokens never sent to auction)
2. ✅ **Currency raised** (from auction bidders)

**Liquidity does NOT come from:**
1. ❌ Sold auction tokens (those went to bidders)
2. ❌ Unsold auction tokens (swept back but not used for liquidity)

The reserve supply is **pre-allocated** and **guaranteed** for liquidity, ensuring there's always tokens available for the migration regardless of auction performance.

## Price During Migration

### Will the Price Be the Same as Final Clearing Price?

**Answer: YES, exactly the same**

**Code Evidence:**

```solidity
// In LBPStrategyBasic._prepareMigrationData()
uint256 priceX192 = auction.clearingPrice().convertToPriceX192(currency < poolToken);
data.sqrtPriceX96 = priceX192.convertToSqrtPriceX96();

// In _initializePool()
poolManager.initialize(key, data.sqrtPriceX96);
```

**Process:**
1. Get clearing price from auction: `auction.clearingPrice()`
2. Convert to Uniswap v4 format: `sqrtPriceX96`
3. Initialize pool at this exact price

**Why this makes sense:**
- Ensures price continuity
- No arbitrage opportunity at migration
- Fair to auction participants
- Last bidders paid clearing price, pool starts at same price

**Example:**
```
Auction clearing price: 0.00002 USDC per token
                        ↓
Pool initialized at:    0.00002 USDC per token (converted to sqrtPriceX96)
                        ↓
First trade price:      ~0.00002 USDC per token (minus any fees/slippage)
```

The pool price will drift from there based on trading activity, but it **starts** at exactly the clearing price.
