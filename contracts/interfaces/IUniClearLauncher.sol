// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IContinuousClearingAuction} from "./IContinuousClearingAuction.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

interface IUniClearLauncher {
    /// @notice Configuration for deploying a new token
    struct TokenConfig {
        string name;
        string symbol;
        uint128 auctionSupply;
        uint128 totalSupply;
        bytes32 salt;
    }

    /// @notice Configuration for the auction
    struct AuctionConfig {
        address raisedCurrency;
        uint64 startBlock;
        uint64 endBlock;
        uint64 claimBlock;
        uint256 floorPrice;
        uint128 requiredCurrencyRaised;
    }

    /// @notice Information about an auction
    struct AuctionInfo {
        IContinuousClearingAuction auction;
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

    /// @notice Deploy a new token and create an auction using ETH
    /// @param tokenConfig Configuration for the new token
    /// @param auctionConfig Configuration for the auction
    /// @param ccaFactory Address of the CCA factory
    /// @return _auction The created auction contract
    function deployTokenCCAWithEth(
        TokenConfig memory tokenConfig,
        AuctionConfig memory auctionConfig,
        address ccaFactory
    ) external payable returns (IContinuousClearingAuction _auction);

    /// @notice Migrate an auction to a Uniswap v4 pool
    /// @param token Address of the token to migrate
    function migrate(address token) external;

    /// @notice Get auction information for a token
    /// @param token Address of the token
    /// @return auction Auction contract address
    /// @return raisedCurrency Currency address
    /// @return reserveSupply Reserve supply amount
    /// @return endBlock Auction end block
    function auctionInfo(
        address token
    )
        external
        view
        returns (IContinuousClearingAuction auction, address raisedCurrency, uint128 reserveSupply, uint64 endBlock);
}
