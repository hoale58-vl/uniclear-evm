# UniClear EVM

A decentralized token launcher with Continuous Clearing Auction (CCA) mechanism and automated Uniswap V4 liquidity migration on Unichain.

## Overview

UniClear provides a fair token launch mechanism through:
- **CREATE2 Token Deployment**: Deterministic token address generation
- **Continuous Clearing Auction (CCA)**: Dynamic price discovery with no front-running
- **Automated Migration**: Seamless transition to Uniswap V4 full-range liquidity
- **UUPS Upgradeable**: Future-proof contract architecture
- **Unichain Native**: Built for Unichain mainnet with forked network testing

## Features

### Token Launcher
- Deploy ERC20 tokens with predictable addresses using CREATE2
- Configure auction parameters (supply, price floor, duration)
- Automatic auction creation via CCA Factory
- Support for both ETH and ERC20 as raise currency

### Continuous Clearing Auction
- Fair price discovery mechanism
- Real-time clearing price updates
- No front-running or MEV exploitation
- Graduated auctions enable liquidity migration
- Failed auctions enable full refunds

### Liquidity Migration
- Automatic Uniswap V4 pool creation
- Full-range liquidity provision
- Raised funds + reserve tokens paired
- LP NFT position returned to launcher

### Upgradeability & Security
- UUPS proxy pattern for upgradeability
- Role-based access control (Admin roles)
- Library linking for shared deployment logic
- Comprehensive test coverage

## Project Structure

```
uniclear-evm/
├── contracts/
│   ├── UniClearLauncher.sol         # Main launcher contract
│   ├── UniClearDeployer.sol         # CREATE2 token deployer library
│   ├── UniClearToken.sol            # ERC20 token implementation
│   ├── interfaces/                  # Contract interfaces
│   │   ├── IUniClearLauncher.sol
│   │   ├── IContinuousClearingAuction.sol
│   │   └── IContinuousClearingAuctionFactory.sol
│   ├── libraries/                   # Shared libraries
│   │   ├── TokenPricing.sol         # Price calculation helpers
│   │   ├── StrategyPlanner.sol      # Liquidity strategy builder
│   │   ├── ActionsBuilder.sol       # Action encoding
│   │   └── ParamsBuilder.sol        # Parameter encoding
│   ├── types/                       # Type definitions
│   │   ├── PositionTypes.sol
│   │   └── Distribution.sol
│   └── test/                        # Test helpers
│       └── MockERC20.sol
├── scripts/
│   ├── config.ts                    # Network configurations
│   ├── deploy.ts                    # Deployment script
│   └── fullflow-uniderp-cca.ts.backup  # Reference implementation
├── test/
│   ├── UniClearLauncher.test.ts                # Unit tests (19 tests)
│   ├── UniClearLauncher.integration.test.ts    # Integration tests (6 tests)
│   ├── UniClearLauncher.bidding.test.ts        # Bidding flow tests (14 tests)
│   └── TEST_SUMMARY.md              # Test coverage summary
├── hardhat.config.ts                # Hardhat configuration
├── package.json
└── README.md
```

## Configuration

### Network Configuration

The project is configured for Unichain networks. See `scripts/config.ts` for contract addresses:

**External Contract Dependencies:**

| Contract | Unichain Mainnet | Unichain Sepolia |
|----------|-----------------|------------------|
| **PositionManager** | `0x4529a01c7a0410167c5740c487a8de60232617bf` | `0xf969aee60879c54baaed9f3ed26147db216fd664` |
| **Create2Deployer** | `0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2` | `0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2` |
| **CcaFactory** | `0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D` | `0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D` |

**Deployed UniClear Contracts:**

| Contract | Unichain Mainnet (Chain ID: 130) | Unichain Sepolia (Chain ID: 1301) |
|----------|-----------------|------------------|
| **UniClearDeployer** (Library) | 🔜 Coming soon | `0xd848f710398c6d2ee9A850E992817f3e8aFc76Cb` |
| **UniClearLauncher** (Proxy) | 🔜 Coming soon | `0xd2465E107f25df9afC09Bfd0f533E9F4fF22B31F` |
| **UniClearLauncher** (Implementation) | 🔜 Coming soon | `0x007F0F96e51628e8e98517451f3F8E06Dc50da59` |

## Architecture

### Core Contracts

#### UniClearLauncher
Main contract for token launches. Features:
- UUPS upgradeable proxy pattern
- Role-based access control
- Integrates with CCA Factory and Uniswap V4
- Handles complete token launch lifecycle

#### UniClearDeployer (Library)
Shared library for CREATE2 token deployment:
- Deterministic address generation
- Token creation with configurable parameters
- Used via library linking

#### UniClearToken
Standard ERC20 implementation with:
- Configurable name, symbol, and supply
- Minting to specified recipients
- Compatible with Uniswap V4 pools

### Integration Points

```
┌─────────────────┐
│ UniClearLauncher│
└────────┬────────┘
         │
         ├──> CREATE2Deployer (Create token)
         │
         ├──> CCAFactory (Launch auction)
         │    └──> ContinuousClearingAuction
         │         ├──> submitBid()
         │         ├──> exitBid()
         │         └──> claimTokens()
         │
         └──> PositionManager (Migrate to Uniswap V4)
              └──> Create full-range liquidity pool
```

### Key Functions

#### Deploy Token and Launch Auction
```solidity
function deployTokenAndLaunchAuction(
    TokenConfig calldata tokenConfig,
    AuctionConfig calldata auctionConfig,
    bytes32 salt
) external payable returns (address auction, address token);
```

#### Launch Auction with Existing Token
```solidity
function launchAuction(
    address token,
    uint128 reserveSupply,
    AuctionConfig calldata auctionConfig,
    bytes32 salt
) external payable returns (address auction);
```

#### Migrate to Uniswap V4
```solidity
function migrate(address token) external;
```

## Development

### Available Scripts

```json
{
  "compile": "hardhat compile",
  "test": "hardhat test",
  "node": "hardhat node",
  "size": "hardhat size-contracts",
  "clean": "hardhat clean"
}
```

## Contributing

### Code Style
- Solidity: Follow Solidity style guide
- TypeScript: Prettier with 120 character line width
- Tests: Descriptive test names and comprehensive coverage

### Testing Requirements
- All new features must include tests
- Maintain > 80% test coverage
- Integration tests for major workflows
- Test against forked network when possible

## License

ISC

## Author

HoaLe - lvhoa58@gmail.com

## Resources

- [Uniswap V4 Documentation](https://docs.uniswap.org/contracts/v4/overview)
- [OpenZeppelin Upgradeable Contracts](https://docs.openzeppelin.com/contracts/5.x/upgradeable)
- [Continuous Clearing Auction Mechanism](https://github.com/Uniswap/cca)
- [Unichain Documentation](https://docs.unichain.org)

## Changelog

### v0.1.0
- Initial release
- UniClearLauncher with CCA integration
- Uniswap V4 migration support
- Comprehensive test suite (39 tests)
- Forked network testing infrastructure
- UUPS upgradeable architecture
