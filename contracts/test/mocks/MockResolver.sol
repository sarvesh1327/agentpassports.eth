// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title MockResolver
/// @notice Test double for ENS addr() resolution.
contract MockResolver {
    mapping(bytes32 => address) private addresses;

    /// @notice Sets the mock EVM address record for a node.
    /// @param node ENS node to update.
    /// @param addr_ Address to return from addr().
    function setAddr(bytes32 node, address addr_) external {
        addresses[node] = addr_;
    }

    /// @notice Returns the configured mock EVM address for a node.
    /// @param node ENS node to resolve.
    /// @return Configured EVM address.
    function addr(bytes32 node) external view returns (address) {
        return addresses[node];
    }
}
