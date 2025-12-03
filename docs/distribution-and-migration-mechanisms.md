# Distribution and Migration Mechanisms

## 1. How Many Ways to Distribute and Migrate

### Distribution Methods

#### In liquidity-launcher (LBPStrategyBasic):
1. **Auction Distribution**: Tokens are split into two parts:
   - `auctionSupply`: Sent to the ContinuousClearingAuction for bidding
   - `reserveSupply`: Held for liquidity pool migration
   - Split ratio controlled by `tokenSplitToAuction` parameter (max 100% = 1e7)

#### In UniClearLauncher:
1. **Auction Distribution**: Similar to liquidity-launcher
   - `auctionSupply`: Sent to auction
   - `reserveSupply`: Held for liquidity migration
   - No configurable split ratio - uses fixed calculation in AuctionInfo

### Migration Methods

#### In liquidity-launcher (LBPStrategyBasic):
The migration can create **up to 3 positions** based on configuration:

1. **Full Range Position** (Always created)
   - Uses calculated `initialTokenAmount` and `initialCurrencyAmount`
   - Range: minUsableTick to maxUsableTick
   - Recipient: `positionRecipient` (from MigratorParameters)

2. **One-Sided Token Position** (Optional)
   - Created when: `createOneSidedTokenPosition = true` AND `reserveSupply > initialTokenAmount`
   - Uses remaining tokens: `reserveSupply - initialTokenAmount`
   - Range: Below current price (minUsableTick to current tick)
   - Recipient: `positionRecipient`

3. **One-Sided Currency Position** (Optional)
   - Created when: `createOneSidedCurrencyPosition = true` AND `leftoverCurrency > 0`
   - Uses leftover currency from full range calculation
   - Range: Above current price (current tick to maxUsableTick)
   - Recipient: `positionRecipient`

#### In UniClearLauncher:
The migration creates **only 1 position**:

1. **Full Range Position** (Always and only)
   - Uses calculated `initialTokenAmount` and `initialCurrencyAmount`
   - Range: minUsableTick to maxUsableTick
   - Recipient: `DEAD_ADDRESS` (0x000000000000000000000000000000000000dEaD) - **Burned/Locked**

**Key Difference**: UniClearLauncher burns the LP position, while LBPStrategyBasic sends it to a specified recipient.

## 2. Position Strategy Summary

| Strategy | Full Range | One-Sided Token | One-Sided Currency | LP Recipient |
|----------|-----------|-----------------|-------------------|--------------|
| **LBPStrategyBasic** | Yes | Optional | Optional | Configurable address |
| **UniClearLauncher** | Yes | No | No | DEAD_ADDRESS (burned) |

The key architectural difference is that:
- **LBPStrategyBasic** offers flexibility with multiple position types and configurable recipient
- **UniClearLauncher** is simpler with a single full-range position that's permanently locked
