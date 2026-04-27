// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title MockENSRegistry
/// @notice Test double for ENS owner and resolver lookups.
contract MockENSRegistry {
    mapping(bytes32 => address) private owners;
    mapping(bytes32 => address) private resolvers;

    /// @notice Sets the mock registry owner for a node.
    /// @param node ENS node to update.
    /// @param owner_ Owner address to return from owner().
    function setOwner(bytes32 node, address owner_) external {
        owners[node] = owner_;
    }

    /// @notice Sets the mock resolver for a node.
    /// @param node ENS node to update.
    /// @param resolver_ Resolver address to return from resolver().
    function setResolver(bytes32 node, address resolver_) external {
        resolvers[node] = resolver_;
    }

    /// @notice Returns the configured mock owner for a node.
    /// @param node ENS node to inspect.
    /// @return Configured owner address.
    function owner(bytes32 node) external view returns (address) {
        return owners[node];
    }

    /// @notice Returns the configured mock resolver for a node.
    /// @param node ENS node to inspect.
    /// @return Configured resolver address.
    function resolver(bytes32 node) external view returns (address) {
        return resolvers[node];
    }
}
