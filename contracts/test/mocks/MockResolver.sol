// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title MockResolver
/// @notice Test double for ENS addr() and text() resolution.
contract MockResolver {
    mapping(bytes32 => address) private addresses;
    mapping(bytes32 => mapping(string => string)) private textRecords;

    /// @notice Sets the mock EVM address record for a node.
    /// @param node ENS node to update.
    /// @param addr_ Address to return from addr().
    function setAddr(bytes32 node, address addr_) external {
        addresses[node] = addr_;
    }

    /// @notice Sets a mock text record for a node.
    /// @param node ENS node to update.
    /// @param key Text-record key to update.
    /// @param value Text-record value returned from text().
    function setText(bytes32 node, string calldata key, string calldata value) external {
        textRecords[node][key] = value;
    }

    /// @notice Returns the configured mock EVM address for a node.
    /// @param node ENS node to resolve.
    /// @return Configured EVM address.
    function addr(bytes32 node) external view returns (address) {
        return addresses[node];
    }

    /// @notice Returns the configured mock text record for a node and key.
    /// @param node ENS node to inspect.
    /// @param key Text-record key to inspect.
    /// @return Configured text value.
    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return textRecords[node][key];
    }
}
