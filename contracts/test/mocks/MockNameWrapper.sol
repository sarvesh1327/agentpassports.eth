// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title MockNameWrapper
/// @notice Test double for wrapped ENS name ownership.
contract MockNameWrapper {
    mapping(uint256 => address) private owners;

    /// @notice Sets the mock wrapped-name owner for a token id.
    /// @param id Wrapped name token id.
    /// @param owner_ Owner address to return from ownerOf().
    function setOwnerOf(uint256 id, address owner_) external {
        owners[id] = owner_;
    }

    /// @notice Returns the configured mock owner for a wrapped name id.
    /// @param id Wrapped name token id.
    /// @return Configured owner address.
    function ownerOf(uint256 id) external view returns (address) {
        return owners[id];
    }
}
