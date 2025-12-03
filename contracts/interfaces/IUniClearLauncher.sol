// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IContinuousClearingAuction} from "./IContinuousClearingAuction.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

interface IUniClearLauncher {
    /// @notice Configuration for deploying a new token
    struct TokenConfig {
        string name;
        string symbol;
        uint256 totalSupply;
    }

    /// @notice Configuration for the auction
    struct AuctionConfig {
        address raisedCurrency;
        int24 tickSpacing;
        uint64 startBlock;
        uint64 endBlock;
        uint64 claimBlock;
        uint256 floorPrice;
        uint128 requiredCurrencyRaised;
        uint128 auctionSupply;
    }

    /// @notice Information about an auction
    struct AuctionInfo {
        IContinuousClearingAuction auction;
        address creator;
        address raisedCurrency;
        uint128 reserveSupply;
        uint64 endBlock;
    }

    /// @notice Data for migrating from auction to Uniswap pool
    struct MigrationData {
        uint160 sqrtPriceX96;
        uint128 initialTokenAmount;
        uint128 leftoverCurrency;
        uint128 initialCurrencyAmount;
        uint128 liquidity;
        bool shouldCreateOneSided;
        bool hasOneSidedParams;
    }

    /// @notice Error thrown when migration is attempted before allowed block
    error MigrationNotAllowed(uint256 migrationBlock, uint256 currentBlock);

    /// @notice Error thrown when currency amount is too high
    error CurrencyAmountTooHigh(uint256 currencyAmount, uint256 maxAmount);

    /// @notice Error thrown when no currency was raised
    error NoCurrencyRaised();

    /// @notice Error thrown when insufficient currency balance
    error InsufficientCurrency(uint256 required, uint256 actual);

    /// @notice Emitted when a new auction is created
    event AuctionCreated(
        address indexed auction,
        address indexed token,
        address indexed creator,
        AuctionConfig auctionConfig
    );

    /// @notice Emitted when an auction is migrated to a Uniswap pool
    event Migrated(PoolKey key, uint160 sqrtPriceX96);

    event MetadataUriUpdated(address auctionAddress, string metadataUri);

    /// @notice Deploy a new token and create an auction using specific currency
    /// @param tokenConfig Configuration for the new token
    /// @param auctionConfig Configuration for the auction
    /// @param salt Salt to create token and auction
    /// @return _auction The created auction contract
    function deployTokenAndLaunchAuction(
        TokenConfig memory tokenConfig,
        AuctionConfig memory auctionConfig,
        bytes32 salt,
        string memory metadataUri
    ) external payable returns (IContinuousClearingAuction _auction);

    /// @notice Create an auction using specific currency
    /// @param tokenAddress Token address use for auction
    /// @param reserveSupply Amount of token reserve for liquidity
    /// @param auctionConfig Configuration for the auction
    /// @param salt Salt to create token and auction
    /// @return _auction The created auction contract
    function launchAuction(
        address tokenAddress,
        uint256 reserveSupply,
        AuctionConfig memory auctionConfig,
        bytes32 salt,
        string memory metadataUri
    ) external payable returns (IContinuousClearingAuction _auction);

    /// @notice Migrate an auction to a Uniswap v4 pool
    /// @param token Address of the token to migrate
    function migrate(address token) external;

    /// @notice Get auction information for a token
    /// @param token Address of the token
    /// @return auction Auction contract address
    /// @return creator Auction creator address
    /// @return raisedCurrency Currency address
    /// @return reserveSupply Reserve supply amount
    /// @return endBlock Auction end block
    function auctionInfo(
        address token
    )
        external
        view
        returns (IContinuousClearingAuction auction, address creator, address raisedCurrency, uint128 reserveSupply, uint64 endBlock);
}
