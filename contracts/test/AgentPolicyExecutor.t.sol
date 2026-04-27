// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {AgentPolicyExecutor} from "../src/AgentPolicyExecutor.sol";
import {TaskLog} from "../src/TaskLog.sol";
import {TestBase} from "./TestBase.sol";
import {MockENSRegistry} from "./mocks/MockENSRegistry.sol";
import {MockNameWrapper} from "./mocks/MockNameWrapper.sol";
import {MockResolver} from "./mocks/MockResolver.sol";

/// @title AgentPolicyExecutorTest
/// @notice Behavior tests for ENS-gated policy execution and relayer reimbursement.
contract AgentPolicyExecutorTest is TestBase {
    uint256 private ownerKey = 0xA11CE;
    uint256 private agentKey = 0xA6E17;
    uint256 private wrongKey = 0xBAD;

    address private owner;
    address private agent;
    address private wrongSigner;
    address private relayer = address(0xBEEF);

    bytes32 private ownerNode = keccak256("alice.eth");
    string private agentLabel = "assistant";
    bytes32 private agentNode;

    MockENSRegistry private ens;
    MockNameWrapper private nameWrapper;
    MockResolver private resolver;
    AgentPolicyExecutor private executor;
    TaskLog private taskLog;

    /// @notice Deploys mocks, executor, task log, and a default ENS agent profile.
    function setUp() public {
        owner = vm.addr(ownerKey);
        agent = vm.addr(agentKey);
        wrongSigner = vm.addr(wrongKey);
        agentNode = keccak256(abi.encodePacked(ownerNode, keccak256(bytes(agentLabel))));

        ens = new MockENSRegistry();
        nameWrapper = new MockNameWrapper();
        resolver = new MockResolver();
        executor = new AgentPolicyExecutor(address(ens), address(nameWrapper));
        taskLog = new TaskLog(address(executor));

        ens.setOwner(ownerNode, owner);
        ens.setResolver(agentNode, address(resolver));
        resolver.setAddr(agentNode, agent);
        vm.deal(owner, 10 ether);
    }

    /// @notice Verifies an ENS owner can create a policy and seed its gas budget.
    function testOwnerCanSetPolicyAndFundGasBudget() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));

        (
            bytes32 storedOwnerNode,
            address ownerWallet,
            address target,
            bytes4 selector,
            uint96 maxValueWei,
            uint96 maxGasReimbursementWei,
            uint64 expiresAt,
            bool enabled
        ) = executor.policies(agentNode);

        assertEq(storedOwnerNode, ownerNode, "owner node");
        assertEq(ownerWallet, owner, "owner wallet");
        assertEq(target, address(taskLog), "target");
        assertEq(selector, TaskLog.recordTask.selector, "selector");
        assertEq(maxValueWei, 0, "max value");
        assertEq(maxGasReimbursementWei, 0.01 ether, "gas cap");
        assertEq(expiresAt, block.timestamp + 1 days, "expiry");
        assertTrue(enabled, "enabled");
        assertEq(executor.gasBudgetWei(agentNode), 1 ether, "gas budget");
    }

    /// @notice Verifies wrapped ENS ownership is accepted when creating a policy.
    function testWrappedOwnerCanSetPolicy() public {
        ens.setOwner(ownerNode, address(nameWrapper));
        nameWrapper.setOwnerOf(uint256(ownerNode), owner);

        _setPolicy(0, 0, 0.01 ether, uint64(block.timestamp + 1 days));

        (, address ownerWallet,,,,,, bool enabled) = executor.policies(agentNode);
        assertEq(ownerWallet, owner, "wrapped owner wallet");
        assertTrue(enabled, "enabled");
    }

    /// @notice Verifies a wallet that does not manage the owner ENS node cannot create a policy.
    function testNonOwnerCannotSetPolicy() public {
        vm.expectRevert(AgentPolicyExecutor.NotNameOwner.selector);
        executor.setPolicy(
            ownerNode,
            agentLabel,
            address(taskLog),
            TaskLog.recordTask.selector,
            0,
            0.01 ether,
            uint64(block.timestamp + 1 days)
        );
    }

    /// @notice Verifies gas budget deposits and owner withdrawals update the agent budget.
    function testDepositAndWithdrawGasBudget() public {
        _setPolicy(0.5 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));

        executor.depositGasBudget{ value: 0.25 ether }(agentNode);
        assertEq(executor.gasBudgetWei(agentNode), 0.75 ether, "after deposit");

        vm.prank(owner);
        executor.withdrawGasBudget(agentNode, 0.2 ether);
        assertEq(executor.gasBudgetWei(agentNode), 0.55 ether, "after withdraw");
    }

    /// @notice Verifies a valid ENS-resolved signature records a task and consumes one nonce.
    function testValidTaskExecutesAndRecordsTask() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));

        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _sign(agentKey, intent);

        vm.prank(relayer);
        bytes memory result = executor.execute(intent, callData, signature);

        assertEq(abi.decode(result, (uint256)), 0, "task id");
        assertEq(taskLog.taskCount(), 1, "task count");
        assertEq(executor.nextNonce(agentNode), 1, "next nonce");
    }

    /// @notice Verifies signatures from addresses other than the ENS-resolved agent fail.
    function testWrongSignerFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1 hours);

        vm.expectRevert(AgentPolicyExecutor.BadSignature.selector);
        executor.execute(intent, callData, _sign(wrongKey, intent));
    }

    /// @notice Verifies changing addr(agentNode) revokes a previously valid agent signature.
    function testChangingEnsAddressInvalidatesOldSignature() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _sign(agentKey, intent);

        resolver.setAddr(agentNode, wrongSigner);

        vm.expectRevert(AgentPolicyExecutor.BadSignature.selector);
        executor.execute(intent, callData, signature);
    }

    /// @notice Verifies execution fails when ENS has no resolver for the agent node.
    function testMissingResolverFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        ens.setResolver(agentNode, address(0));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1 hours);

        vm.expectRevert(AgentPolicyExecutor.ResolverNotSet.selector);
        executor.execute(intent, callData, _sign(agentKey, intent));
    }

    /// @notice Verifies execution fails when the resolver returns a zero agent address.
    function testMissingAgentAddressFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        resolver.setAddr(agentNode, address(0));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1 hours);

        vm.expectRevert(AgentPolicyExecutor.AgentAddressNotSet.selector);
        executor.execute(intent, callData, _sign(agentKey, intent));
    }

    /// @notice Verifies an intent cannot execute after its own expiry timestamp.
    function testExpiredIntentFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1);

        vm.warp(block.timestamp + 2);

        vm.expectRevert(AgentPolicyExecutor.IntentExpired.selector);
        executor.execute(intent, callData, _sign(agentKey, intent));
    }

    /// @notice Verifies an intent cannot execute after the policy expiry timestamp.
    function testExpiredPolicyFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2);

        vm.expectRevert(AgentPolicyExecutor.PolicyExpired.selector);
        executor.execute(intent, callData, _sign(agentKey, intent));
    }

    /// @notice Verifies target addresses outside the policy are rejected.
    function testWrongTargetFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = AgentPolicyExecutor.TaskIntent(
            agentNode,
            address(0xCAFE),
            keccak256(callData),
            0,
            0,
            uint64(block.timestamp + 1 hours)
        );

        vm.expectRevert(AgentPolicyExecutor.TargetNotAllowed.selector);
        executor.execute(intent, callData, _sign(agentKey, intent));
    }

    /// @notice Verifies calldata selectors outside the policy are rejected.
    function testWrongSelectorFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        bytes memory callData = abi.encodeWithSelector(bytes4(0xdeadbeef), agentNode);
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1 hours);

        vm.expectRevert(AgentPolicyExecutor.SelectorNotAllowed.selector);
        executor.execute(intent, callData, _sign(agentKey, intent));
    }

    /// @notice Verifies calldata mutation is rejected through callDataHash validation.
    function testBadCalldataHashFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = AgentPolicyExecutor.TaskIntent(
            agentNode,
            address(taskLog),
            bytes32("bad"),
            0,
            0,
            uint64(block.timestamp + 1 hours)
        );

        vm.expectRevert(AgentPolicyExecutor.BadCalldataHash.selector);
        executor.execute(intent, callData, _sign(agentKey, intent));
    }

    /// @notice Verifies an intent cannot send more ETH value than the policy permits.
    function testHighValueFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 1 wei, block.timestamp + 1 hours);

        vm.expectRevert(AgentPolicyExecutor.ValueTooHigh.selector);
        executor.execute(intent, callData, _sign(agentKey, intent));
    }

    /// @notice Verifies a signed intent cannot be replayed after its nonce is consumed.
    function testReplayFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _sign(agentKey, intent);

        executor.execute(intent, callData, signature);

        vm.expectRevert(AgentPolicyExecutor.BadNonce.selector);
        executor.execute(intent, callData, signature);
    }

    /// @notice Verifies disabled policies reject otherwise valid signed intents.
    function testRevokedPolicyFails() public {
        _setPolicy(1 ether, 0, 0.01 ether, uint64(block.timestamp + 1 days));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1 hours);

        vm.prank(owner);
        executor.revokePolicy(agentNode);

        vm.expectRevert(AgentPolicyExecutor.PolicyDisabled.selector);
        executor.execute(intent, callData, _sign(agentKey, intent));
    }

    /// @notice Verifies relayer reimbursement cannot exceed the policy cap.
    function testReimbursementIsCapped() public {
        uint96 cap = 1 gwei;
        _setPolicy(1 ether, 0, cap, uint64(block.timestamp + 1 days));
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentPolicyExecutor.TaskIntent memory intent = _intent(callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _sign(agentKey, intent);

        uint256 beforeBalance = relayer.balance;
        vm.txGasPrice(1 gwei);
        vm.prank(relayer);
        executor.execute(intent, callData, signature);
        uint256 reimbursed = relayer.balance - beforeBalance;

        assertLe(reimbursed, cap, "reimbursement cap");
        assertGt(reimbursed, 0, "relayer reimbursed");
    }

    /// @notice Creates a default task-log policy from the ENS owner account.
    /// @param budget Initial gas budget to deposit with setPolicy().
    /// @param maxValue Maximum task call value in wei.
    /// @param gasCap Maximum relayer reimbursement in wei.
    /// @param expiresAt Policy expiry timestamp.
    function _setPolicy(uint256 budget, uint96 maxValue, uint96 gasCap, uint64 expiresAt) private {
        vm.prank(owner);
        bytes32 returnedAgentNode = executor.setPolicy{ value: budget }(
            ownerNode,
            agentLabel,
            address(taskLog),
            TaskLog.recordTask.selector,
            maxValue,
            gasCap,
            expiresAt
        );
        assertEq(returnedAgentNode, agentNode, "agent node");
    }

    /// @notice Builds TaskLog.recordTask calldata for the default task.
    /// @param metadataURI Metadata URI included in the task proof.
    /// @return Encoded calldata targeting TaskLog.recordTask.
    function _taskCallData(string memory metadataURI) private view returns (bytes memory) {
        return abi.encodeCall(
            TaskLog.recordTask,
            (agentNode, ownerNode, keccak256("Record wallet health check"), metadataURI)
        );
    }

    /// @notice Builds a TaskIntent for the default TaskLog target.
    /// @param callData Calldata whose hash is committed by the intent.
    /// @param value ETH value included in the intent.
    /// @param expiresAt Intent expiry timestamp.
    /// @return Intent populated with the current executor nonce.
    function _intent(bytes memory callData, uint256 value, uint256 expiresAt)
        private
        view
        returns (AgentPolicyExecutor.TaskIntent memory)
    {
        return AgentPolicyExecutor.TaskIntent(
            agentNode,
            address(taskLog),
            keccak256(callData),
            value,
            executor.nextNonce(agentNode),
            uint64(expiresAt)
        );
    }

    /// @notice Signs a TaskIntent with the same EIP-712 domain used by the executor.
    /// @param privateKey Test private key used for signing.
    /// @param intent Intent to sign.
    /// @return Signature encoded as r, s, v.
    function _sign(uint256 privateKey, AgentPolicyExecutor.TaskIntent memory intent)
        private
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                executor.TASK_INTENT_TYPEHASH(),
                intent.agentNode,
                intent.target,
                intent.callDataHash,
                intent.value,
                intent.nonce,
                intent.expiresAt
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                executor.DOMAIN_TYPEHASH(),
                keccak256(bytes("AgentPolicyExecutor")),
                keccak256(bytes("1")),
                block.chainid,
                address(executor)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
