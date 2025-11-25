// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Value scaled by 1e7
type ValueX7 is uint256;

/// @notice Checkpoint struct for auction state
struct Checkpoint {
    uint256 clearingPrice; // The X96 price which the auction is currently clearing at
    ValueX7 currencyRaisedAtClearingPriceQ96_X7; // The currency raised so far to this clearing price
    uint256 cumulativeMpsPerPrice; // A running sum of the ratio between mps and price
    uint24 cumulativeMps; // The number of mps sold in the auction so far (via the original supply schedule)
    uint64 prev; // Block number of the previous checkpoint
    uint64 next; // Block number of the next checkpoint
}

/// @notice Interface for checkpoint storage operations
interface ICheckpointStorage {
    /// @notice Revert when attempting to insert a checkpoint at a block number not strictly greater than the last one
    error CheckpointBlockNotIncreasing();

    /// @notice Get the latest checkpoint at the last checkpointed block
    /// @dev Be aware that the latest checkpoint may not be up to date, it is recommended
    ///      to always call `checkpoint()` before using getter functions
    /// @return The latest checkpoint
    function latestCheckpoint() external view returns (Checkpoint memory);

    /// @notice Get the clearing price at the last checkpointed block
    /// @dev Be aware that the latest checkpoint may not be up to date, it is recommended
    ///      to always call `checkpoint()` before using getter functions
    /// @return The current clearing price in Q96 form
    function clearingPrice() external view returns (uint256);

    /// @notice Get the number of the last checkpointed block
    /// @dev Be aware that the last checkpointed block may not be up to date, it is recommended
    ///      to always call `checkpoint()` before using getter functions
    /// @return The block number of the last checkpoint
    function lastCheckpointedBlock() external view returns (uint64);

    /// @notice Get a checkpoint at a block number
    /// @param blockNumber The block number to get the checkpoint for
    function checkpoints(uint64 blockNumber) external view returns (Checkpoint memory);
}
