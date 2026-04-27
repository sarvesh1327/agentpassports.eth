// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {TaskLog} from "../src/TaskLog.sol";
import {TestBase} from "./TestBase.sol";

/// @title TaskLogTest
/// @notice Behavior tests for executor-only task proof recording.
contract TaskLogTest is TestBase {
    address private executor = address(0xEEC);
    TaskLog private taskLog;

    /// @notice Deploys a fresh TaskLog for each test.
    function setUp() public {
        taskLog = new TaskLog(executor);
    }

    /// @notice Verifies the configured executor can record a task proof.
    function testExecutorCanRecordTaskProof() public {
        bytes32 agentNode = keccak256("assistant.alice.eth");
        bytes32 ownerNode = keccak256("alice.eth");
        bytes32 taskHash = keccak256("Record wallet health check");

        vm.prank(executor);
        uint256 taskId = taskLog.recordTask(agentNode, ownerNode, taskHash, "ipfs://demo");

        assertEq(taskId, 0, "first task id");
        assertEq(taskLog.taskCount(), 1, "task count");

        (bytes32 storedAgentNode, bytes32 storedOwnerNode, bytes32 storedTaskHash, string memory uri,) =
            taskLog.tasks(0);
        assertEq(storedAgentNode, agentNode, "agent node");
        assertEq(storedOwnerNode, ownerNode, "owner node");
        assertEq(storedTaskHash, taskHash, "task hash");
        assertEq(keccak256(bytes(uri)), keccak256(bytes("ipfs://demo")), "metadata URI");
    }

    /// @notice Verifies non-executor callers cannot record task proofs.
    function testNonExecutorCannotRecordTaskProof() public {
        vm.expectRevert(TaskLog.NotExecutor.selector);
        taskLog.recordTask(bytes32("agent"), bytes32("owner"), bytes32("task"), "ipfs://demo");
    }
}
