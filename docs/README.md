# UniClearLauncher Documentation

This documentation suite provides comprehensive analysis of the UniClearLauncher contract and its relationship to the liquidity-launcher framework.

## Documentation Files

### 1. [Distribution and Migration Mechanisms](./distribution-and-migration-mechanisms.md)
Answers: **How many ways to distribute and migrate?**

**Key Topics:**
- Distribution methods in both systems
- Migration strategies comparison
- Position types (full range vs one-sided)
- Summary comparison table

**Quick Answer:**
- LBPStrategyBasic: Up to 3 positions (full range + optional one-sided token + optional one-sided currency)
- UniClearLauncher: 1 position (full range only, burned to DEAD_ADDRESS)

---

### 2. [UniClearLauncher vs LiquidityLauncher](./uniclear-vs-liquidity-launcher.md)
Answers: **What does UniClearLauncher use and what's different compared to liquidity-launcher?**

**Key Topics:**
- Architecture comparison (flexible framework vs monolithic)
- Parameter usage differences
- MigratorParameters analysis
- Code reuse patterns
- When to use which system

**Quick Answer:**
- UniClearLauncher is a simplified, opinionated version
- Does NOT use MigratorParameters
- Hardcodes many values (pool fee, tick spacing, LP recipient)
- Reuses pricing libraries but not the strategy pattern

---

### 3. [Post-Auction Scenarios](./post-auction-scenarios.md)
Answers: **What scenarios can happen after auction success? Is MigratorParameters needed in UniClearLauncher? How do createOneSidedTokenPosition and createOneSidedCurrencyPosition affect migration?**

**Key Topics:**
- Three post-auction scenarios (exact match, excess currency, excess tokens)
- MigratorParameters necessity analysis
- One-sided position configuration impact
- Validation and fallback logic
- Scenario comparison table

**Quick Answer:**
- MigratorParameters: NOT needed in UniClearLauncher
- One-sided flags: Control capital efficiency in LBPStrategyBasic
- UniClearLauncher: Hardcodes both flags to false (no one-sided positions)

---

### 4. [Liquidity Source and Examples](./liquidity-source-and-examples.md)
Answers: **Where does liquidity come from for migration? (reserve or auction remainder?) What about 100B token example? Will migration price equal final clearing price?**

**Key Topics:**
- Liquidity source explanation (RESERVE, not auction)
- Token flow diagram
- Detailed 100B token examples (3 scenarios)
- Price continuity during migration

**Quick Answer:**
- Liquidity from: RESERVE SUPPLY (tokens never sent to auction) + RAISED CURRENCY
- NOT from: Sold auction tokens (those go to bidders)
- Migration price: YES, exactly equals final clearing price
- Example with 100B tokens shows different scenarios based on demand

---

## Quick Reference

### Key Differences at a Glance

| Feature | LBPStrategyBasic | UniClearLauncher |
|---------|-----------------|------------------|
| **Position types** | 1-3 positions | 1 position |
| **LP recipient** | Configurable | DEAD_ADDRESS (burned) |
| **One-sided positions** | Optional | Never |
| **Uses MigratorParameters** | Yes | No |
| **Pool configuration** | Configurable | Hardcoded |
| **Architecture** | Pluggable strategy | Monolithic |
| **Access control** | Operator-based | Admin role |
| **Upgradeability** | No | Yes (UUPS) |

### Critical Concepts

1. **Reserve Supply**: Tokens held separately from auction, used exclusively for liquidity migration
2. **Clearing Price**: Final auction price, exactly equals initial pool price
3. **One-Sided Positions**: Optional positions in LBP that improve capital efficiency by using leftover assets
4. **Burning LP Tokens**: UniClearLauncher permanently locks liquidity by sending LP to DEAD_ADDRESS

### Code Location Reference

**UniClearLauncher Key Functions:**
- `migrate()`: contracts/UniClearLauncher.sol:170
- `_prepareMigrationData()`: contracts/UniClearLauncher.sol:220
- `_createPositionPlan()`: contracts/UniClearLauncher.sol:266

**LBPStrategyBasic Key Functions:**
- `migrate()`: liquidity-launcher/src/distributionContracts/LBPStrategyBasic.sol:139
- `_prepareMigrationData()`: liquidity-launcher/src/distributionContracts/LBPStrategyBasic.sol:259
- `_createOneSidedPositionPlan()`: liquidity-launcher/src/distributionContracts/LBPStrategyBasic.sol:424

**Shared Libraries:**
- TokenPricing: liquidity-launcher/src/libraries/TokenPricing.sol
- StrategyPlanner: liquidity-launcher/src/libraries/StrategyPlanner.sol
- TokenDistribution: liquidity-launcher/src/libraries/TokenDistribution.sol

## Questions Answered

- ✅ How many ways to distribute and migrate?
- ✅ What does UniClearLauncher use compared to liquidity-launcher?
- ✅ What scenarios happen after auction success?
- ✅ Is MigratorParameters needed in UniClearLauncher?
- ✅ How do createOneSidedTokenPosition and createOneSidedCurrencyPosition affect migration?
- ✅ Where does liquidity come from? (reserve or auction remainder)
- ✅ Example with 100B total supply token
- ✅ Will migration price equal final clearing price?

## Additional Resources

- [Uniswap v4 Documentation](https://docs.uniswap.org/contracts/v4/overview)
- [Continuous Clearing Auction Spec](https://github.com/Uniswap/continuous-clearing-auction)
- Contract interfaces in `contracts/interfaces/`
