// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

struct Bid {
    uint64 startBlock; // Block number when the bid was first made in
    uint24 startCumulativeMps; // Cumulative mps at the start of the bid
    uint64 exitedBlock; // Block number when the bid was exited
    uint256 maxPrice; // The max price of the bid
    address owner; // Who will receive the tokens filled and currency refunded
    uint256 amountQ96; // User's currency amount in Q96 form
    uint256 tokensFilled; // Amount of tokens filled
}

/// @notice Interface for bid storage operations
interface IBidStorage {
    /// @notice Error thrown when doing an operation on a bid that does not exist
    error BidIdDoesNotExist(uint256 bidId);

    /// @notice Get the id of the next bid to be created
    /// @return The id of the next bid to be created
    function nextBidId() external view returns (uint256);

    /// @notice Get a bid from storage
    /// @dev Will revert if the bid does not exist
    /// @param bidId The id of the bid to get
    /// @return The bid
    function bids(uint256 bidId) external view returns (Bid memory);
}
