// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title MockValueTarget
/// @notice Payable target used to verify per-agent value accounting in executor tests.
contract MockValueTarget {
    mapping(bytes32 => uint256) public received;

    event ValueRecorded(bytes32 indexed agentNode, uint256 amount);

    /// @notice Records ETH value received for an agent node.
    /// @param agentNode Agent node associated with the value transfer.
    /// @return amount ETH value received by this call.
    function recordValue(bytes32 agentNode) external payable returns (uint256 amount) {
        amount = msg.value;
        received[agentNode] += amount;
        emit ValueRecorded(agentNode, amount);
    }
}
