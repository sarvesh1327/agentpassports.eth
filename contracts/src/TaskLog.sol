// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title TaskLog
/// @notice Stores task proof records written only by the policy executor.
contract TaskLog {
    error NotExecutor();
    error ZeroAddress();

    event TaskRecorded(
        uint256 indexed taskId,
        bytes32 indexed agentNode,
        bytes32 indexed ownerNode,
        bytes32 taskHash,
        string metadataURI,
        uint256 timestamp
    );

    /// @notice Onchain proof that an ENS-registered agent completed a task.
    struct TaskRecord {
        bytes32 agentNode;
        bytes32 ownerNode;
        bytes32 taskHash;
        string metadataURI;
        uint256 timestamp;
    }

    address public immutable executor;
    TaskRecord[] public tasks;

    /// @notice Creates a task log bound to one executor contract.
    /// @param executor_ Address allowed to write task records.
    constructor(address executor_) {
        if (executor_ == address(0)) revert ZeroAddress();

        executor = executor_;
    }

    /// @notice Records a task proof after executor authorization succeeds.
    /// @dev Only AgentPolicyExecutor can write records, so every proof has passed policy checks first.
    /// @param agentNode ENS namehash for the agent identity.
    /// @param ownerNode ENS namehash for the owner identity.
    /// @param taskHash Hash of the task content or result.
    /// @param metadataURI URI containing task metadata for offchain display.
    /// @return taskId Index of the stored task record.
    function recordTask(
        bytes32 agentNode,
        bytes32 ownerNode,
        bytes32 taskHash,
        string calldata metadataURI
    ) external returns (uint256 taskId) {
        if (msg.sender != executor) revert NotExecutor();

        taskId = tasks.length;
        tasks.push(
            TaskRecord({
                agentNode: agentNode,
                ownerNode: ownerNode,
                taskHash: taskHash,
                metadataURI: metadataURI,
                timestamp: block.timestamp
            })
        );

        emit TaskRecorded(taskId, agentNode, ownerNode, taskHash, metadataURI, block.timestamp);
    }

    /// @notice Returns the number of task proof records stored.
    /// @return Number of recorded task proofs.
    function taskCount() external view returns (uint256) {
        return tasks.length;
    }
}
