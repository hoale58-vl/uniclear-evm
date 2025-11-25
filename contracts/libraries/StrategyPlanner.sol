// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {BasePositionParams, FullRangeParams, TickBounds} from "../types/PositionTypes.sol";

import {ParamsBuilder} from "./ParamsBuilder.sol";
import {ActionsBuilder} from "./ActionsBuilder.sol";

/// @title PositionPlanner
/// @notice Simplified library that orchestrates position planning using helper libraries
library StrategyPlanner {
    // using TickCalculations for int24;
    using ParamsBuilder for *;

    /// @notice Creates the actions and parameters needed to mint a full range position on the position manager
    /// @param baseParams The base parameters for the position
    /// @param fullRangeParams The amounts of currency and token that will be used to mint the position
    /// @param paramsArraySize The size of the parameters array (either 5 if it's a standalone full range position,
    ///                        or 8 if it's a full range position with one sided position)
    /// @return actions The actions needed to mint a full range position on the position manager
    /// @return params The parameters needed to mint a full range position on the position manager
    function planFullRangePosition(
        BasePositionParams memory baseParams,
        FullRangeParams memory fullRangeParams,
        uint256 paramsArraySize
    ) internal pure returns (bytes memory actions, bytes[] memory params) {
        bool currencyIsCurrency0 = baseParams.currency < baseParams.poolToken;

        // Get tick bounds for full range
        TickBounds memory bounds = TickBounds({
            lowerTick: TickMath.minUsableTick(baseParams.poolTickSpacing),
            upperTick: TickMath.maxUsableTick(baseParams.poolTickSpacing)
        });

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(currencyIsCurrency0 ? baseParams.currency : baseParams.poolToken),
            currency1: Currency.wrap(currencyIsCurrency0 ? baseParams.poolToken : baseParams.currency),
            fee: baseParams.poolLPFee,
            tickSpacing: baseParams.poolTickSpacing,
            hooks: baseParams.hooks
        });

        actions = ActionsBuilder.buildFullRangeActions();
        params = fullRangeParams.buildFullRangeParams(
            poolKey,
            bounds,
            currencyIsCurrency0,
            paramsArraySize,
            baseParams.positionRecipient,
            baseParams.liquidity
        );

        // Build actions
        return (actions, params);
    }

    function planFinalTakePair(
        BasePositionParams memory baseParams,
        bytes memory existingActions,
        bytes[] memory existingParams
    ) internal view returns (bytes memory actions, bytes[] memory params) {
        bool currencyIsCurrency0 = baseParams.currency < baseParams.poolToken;
        actions = ActionsBuilder.buildFinalTakePairActions(existingActions);
        params = ParamsBuilder.buildFinalTakePairParams(
            currencyIsCurrency0 ? baseParams.currency : baseParams.poolToken,
            currencyIsCurrency0 ? baseParams.poolToken : baseParams.currency,
            existingParams
        );
        return (actions, params);
    }
}
