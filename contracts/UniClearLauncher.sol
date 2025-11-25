// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// OpenZeppelin imports
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Uniswap v4 Core imports
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

// Uniswap v4 Periphery imports
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {ActionConstants} from "@uniswap/v4-periphery/src/libraries/ActionConstants.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

// Local interfaces
import {IUniClearLauncher} from "./interfaces/IUniClearLauncher.sol";
import {IContinuousClearingAuction} from "./interfaces/IContinuousClearingAuction.sol";
import {IContinuousClearingAuctionFactory} from "./interfaces/IContinuousClearingAuctionFactory.sol";

// Local libraries
import {TokenPricing} from "./libraries/TokenPricing.sol";
import {StrategyPlanner} from "./libraries/StrategyPlanner.sol";
import {UniClearDeployer} from "./UniClearDeployer.sol";

// Local types
import {BasePositionParams, FullRangeParams} from "./types/PositionTypes.sol";

/// @notice Parameters for the auction
/// @dev token and totalSupply are passed as constructor arguments
struct AuctionParameters {
    address currency; // token to raise funds in. Use address(0) for ETH
    address tokensRecipient; // address to receive leftover tokens
    address fundsRecipient; // address to receive all raised funds
    uint64 startBlock; // Block which the first step starts
    uint64 endBlock; // When the auction finishes
    uint64 claimBlock; // Block when the auction can claimed
    int24 tickSpacing; // Fixed granularity for prices
    address validationHook; // Optional hook called before a bid
    uint256 floorPrice; // Starting floor price for the auction
    uint128 requiredCurrencyRaised; // Amount of currency required to be raised for the auction to graduate
    bytes auctionStepsData; // Packed bytes describing token issuance schedule
}

contract UniClearLauncher is IUniClearLauncher {
    // Libs
    using SafeERC20 for IERC20;
    using TokenPricing for uint256;
    using StrategyPlanner for BasePositionParams;

    // Storage
    mapping(address => AuctionInfo) public auctionInfo;

    // Constants
    /// @notice Number of params needed for a standalone full-range position
    ///         (1. mint, 2. settle, 3. settle, 4. take pair)
    uint256 public constant FULL_RANGE_SIZE = 4;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint256 public deployFee = 0.001 ether; // Example fee
    address public create2Deployer; // Set in constructor
    IPositionManager public positionManager; // Set in constructor
    IHooks public hooks; // Set in constructor
    uint24 public constant POOL_FEE = 3000; // 0.3%
    int24 public constant TICK_SPACING = 60;

    constructor(address _create2Deployer, address _positionManager, address _hooks) {
        create2Deployer = _create2Deployer;
        positionManager = IPositionManager(_positionManager);
        hooks = IHooks(_hooks);
    }

    function deployTokenCCAWithEth(
        TokenConfig memory tokenConfig,
        AuctionConfig memory auctionConfig,
        address ccaFactory
    ) public payable returns (IContinuousClearingAuction _auction) {
        require(deployFee == msg.value, "invalid fee");

        // deploy the token
        address tokenAddress = UniClearDeployer.deployToken(create2Deployer, tokenConfig, address(this)); // Placeholder - replace with actual deployment

        uint40 blockDelta = uint40(auctionConfig.endBlock - auctionConfig.startBlock);
        AuctionParameters memory configData = AuctionParameters({
            currency: auctionConfig.raisedCurrency,
            tokensRecipient: ActionConstants.MSG_SENDER,
            fundsRecipient: ActionConstants.MSG_SENDER,
            startBlock: auctionConfig.startBlock,
            endBlock: auctionConfig.endBlock,
            claimBlock: auctionConfig.claimBlock,
            tickSpacing: 60,
            validationHook: address(0),
            floorPrice: auctionConfig.floorPrice,
            requiredCurrencyRaised: auctionConfig.requiredCurrencyRaised,
            auctionStepsData: abi.encodePacked(
                uint24(1e7 / blockDelta), // mps
                blockDelta // block delta
            )
        });

        // Call the strategy deploy a new instance.
        _auction = IContinuousClearingAuction(
            address(
                IContinuousClearingAuctionFactory(ccaFactory).initializeDistribution(
                    tokenAddress,
                    tokenConfig.auctionSupply,
                    abi.encode(configData),
                    tokenConfig.salt
                )
            )
        );

        // Save auction info
        auctionInfo[tokenAddress] = AuctionInfo({
            auction: _auction,
            raisedCurrency: auctionConfig.raisedCurrency,
            reserveSupply: tokenConfig.totalSupply - tokenConfig.auctionSupply,
            endBlock: auctionConfig.endBlock
        });

        // Now transfer the tokens to the distribution address
        IERC20(tokenAddress).safeTransfer(address(_auction), tokenConfig.auctionSupply);

        // Notify the distribution contract that it has received the tokens
        _auction.onTokensReceived();

        emit AuctionCreated(address(_auction), tokenAddress, msg.sender, auctionConfig);
    }

    function migrate(address token) external {
        IContinuousClearingAuction auction = auctionInfo[token].auction;
        auction.sweepCurrency();
        auction.sweepUnsoldTokens();

        _validateMigration(token);

        MigrationData memory data = _prepareMigrationData(token);

        PoolKey memory key = _initializePool(token, data.sqrtPriceX96);

        bytes memory plan = _createPositionPlan(token, data);

        _transferAssetsAndExecutePlan(token, data, plan);

        emit Migrated(key, data.sqrtPriceX96);
    }

    /// @notice Validates migration timing and currency balance
    function _validateMigration(address token) private {
        AuctionInfo memory _auctionInfo = auctionInfo[token];
        IContinuousClearingAuction auction = _auctionInfo.auction;
        address currency = _auctionInfo.raisedCurrency;
        uint256 migrationBlock = _auctionInfo.endBlock + 1;

        if (block.number < migrationBlock) {
            revert MigrationNotAllowed(migrationBlock, block.number);
        }

        // call checkpoint to get the final currency raised and clearing price
        auction.checkpoint();
        uint256 currencyAmount = auction.currencyRaised();

        // cannot create a v4 pool with more than type(uint128).max currency amount
        if (currencyAmount > type(uint128).max) {
            revert CurrencyAmountTooHigh(currencyAmount, type(uint128).max);
        }

        // cannot create a v4 pool with no currency raised
        if (currencyAmount == 0) {
            revert NoCurrencyRaised();
        }

        if (Currency.wrap(currency).balanceOf(address(this)) < currencyAmount) {
            revert InsufficientCurrency(currencyAmount, Currency.wrap(currency).balanceOf(address(this)));
        }
    }

    /// @notice Prepares all migration data including prices, amounts, and liquidity calculations
    /// @return data MigrationData struct containing all calculated values
    function _prepareMigrationData(address poolToken) private view returns (MigrationData memory data) {
        AuctionInfo memory _auctionInfo = auctionInfo[poolToken];
        IContinuousClearingAuction auction = _auctionInfo.auction;
        address currency = _auctionInfo.raisedCurrency;
        uint128 reserveSupply = _auctionInfo.reserveSupply;

        uint128 currencyRaised = uint128(auction.currencyRaised()); // already validated to be less than or equal to type(uint128).max

        uint256 priceX192 = auction.clearingPrice().convertToPriceX192(currency < poolToken);

        data.sqrtPriceX96 = priceX192.convertToSqrtPriceX96();

        (data.initialTokenAmount, data.leftoverCurrency, data.initialCurrencyAmount) = priceX192.calculateAmounts(
            currencyRaised,
            currency < poolToken,
            reserveSupply
        );

        data.liquidity = LiquidityAmounts.getLiquidityForAmounts(
            data.sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(TickMath.minUsableTick(TICK_SPACING)),
            TickMath.getSqrtPriceAtTick(TickMath.maxUsableTick(TICK_SPACING)),
            currency < poolToken ? data.initialCurrencyAmount : data.initialTokenAmount,
            currency < poolToken ? data.initialTokenAmount : data.initialCurrencyAmount
        );

        return data;
    }

    function _initializePool(address poolToken, uint160 sqrtPriceX96) private returns (PoolKey memory key) {
        AuctionInfo memory _auctionInfo = auctionInfo[poolToken];
        address currency = _auctionInfo.raisedCurrency;

        key = PoolKey({
            currency0: Currency.wrap(currency < poolToken ? currency : poolToken),
            currency1: Currency.wrap(currency < poolToken ? poolToken : currency),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: hooks
        });
        positionManager.initializePool(key, sqrtPriceX96);
    }

    /// @notice Creates the position plan based on migration data
    /// @param data Migration data with all necessary parameters
    /// @return plan The encoded position plan
    function _createPositionPlan(
        address poolToken,
        MigrationData memory data
    ) private view returns (bytes memory plan) {
        AuctionInfo memory _auctionInfo = auctionInfo[poolToken];
        address currency = _auctionInfo.raisedCurrency;

        bytes memory actions;
        bytes[] memory params;

        // Create base parameters
        BasePositionParams memory baseParams = BasePositionParams({
            currency: currency,
            poolToken: poolToken,
            poolLPFee: POOL_FEE,
            poolTickSpacing: TICK_SPACING,
            initialSqrtPriceX96: data.sqrtPriceX96,
            liquidity: data.liquidity,
            positionRecipient: DEAD_ADDRESS,
            hooks: hooks
        });

        (actions, params) = _createFullRangePositionPlan(
            baseParams,
            data.initialTokenAmount,
            data.initialCurrencyAmount,
            FULL_RANGE_SIZE
        );

        (actions, params) = _createFinalTakePairPlan(baseParams, actions, params);

        return abi.encode(actions, params);
    }

    /// @notice Transfers assets to position manager and executes the position plan
    /// @param data Migration data with amounts and flags
    /// @param plan The encoded position plan to execute
    function _transferAssetsAndExecutePlan(address token, MigrationData memory data, bytes memory plan) private {
        AuctionInfo memory _auctionInfo = auctionInfo[token];
        address currency = _auctionInfo.raisedCurrency;

        // Calculate token amount to transfer
        uint128 tokenTransferAmount = data.initialTokenAmount;

        // Transfer tokens to position manager
        Currency.wrap(token).transfer(address(positionManager), tokenTransferAmount);

        // Calculate currency amount and execute plan
        uint128 currencyTransferAmount = data.initialCurrencyAmount;

        if (Currency.wrap(currency).isAddressZero()) {
            // Native currency: send as value with modifyLiquidities call
            positionManager.modifyLiquidities{value: currencyTransferAmount}(plan, block.timestamp);
        } else {
            // Non-native currency: transfer first, then call modifyLiquidities
            Currency.wrap(currency).transfer(address(positionManager), currencyTransferAmount);
            positionManager.modifyLiquidities(plan, block.timestamp);
        }
    }

    /// @notice Creates the plan for creating a full range v4 position using the position manager
    /// @param baseParams The base parameters for the position
    /// @param tokenAmount The amount of token to be used to create the position
    /// @param currencyAmount The amount of currency to be used to create the position
    /// @param paramsArraySize The size of the parameters array (either 5 or 8)
    /// @return The actions and parameters for the position
    function _createFullRangePositionPlan(
        BasePositionParams memory baseParams,
        uint128 tokenAmount,
        uint128 currencyAmount,
        uint256 paramsArraySize
    ) private pure returns (bytes memory, bytes[] memory) {
        // Create full range specific parameters
        FullRangeParams memory fullRangeParams = FullRangeParams({
            tokenAmount: tokenAmount,
            currencyAmount: currencyAmount
        });

        // Plan the full range position
        return baseParams.planFullRangePosition(fullRangeParams, paramsArraySize);
    }

    /// @notice Creates the plan for taking the pair using the position manager
    /// @param baseParams The base parameters for the position
    /// @param actions The existing actions for the position which may be extended with the new actions for the final take pair
    /// @param params The existing parameters for the position which may be extended with the new parameters for the final take pair
    /// @return The actions and parameters needed to take the pair using the position manager
    function _createFinalTakePairPlan(
        BasePositionParams memory baseParams,
        bytes memory actions,
        bytes[] memory params
    ) private view returns (bytes memory, bytes[] memory) {
        return baseParams.planFinalTakePair(actions, params);
    }

    receive() external payable {}
}
