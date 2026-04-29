// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { AgentEnsExecutor } from "../src/AgentEnsExecutor.sol";
import { TaskLog } from "../src/TaskLog.sol";
import { TestBase } from "./TestBase.sol";
import { MockENSRegistry } from "./mocks/MockENSRegistry.sol";
import { MockNameWrapper } from "./mocks/MockNameWrapper.sol";
import { MockResolver } from "./mocks/MockResolver.sol";
import { MockValueTarget } from "./mocks/MockValueTarget.sol";

/// @title AgentEnsExecutorTest
/// @notice V1 executor tests proving ENS text records, not contract policy storage, authorize tasks.
contract AgentEnsExecutorTest is TestBase {
    uint256 private constant SECP256K1_N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    uint256 private agentKey = 0xA6E17;
    uint256 private relayerKey = 0xBEEF;
    uint256 private wrongKey = 0xBAD;

    address private agent;
    address private wrongSigner;
    address private owner = address(0xA11CE);
    address private relayer;

    bytes32 private ownerNode = keccak256("alice.eth");
    bytes32 private agentNode;

    MockENSRegistry private ens;
    MockNameWrapper private nameWrapper;
    MockResolver private resolver;
    MockValueTarget private valueTarget;
    AgentEnsExecutor private executor;
    TaskLog private taskLog;

    /// @notice Deploys ENS mocks and publishes a default active ENS policy digest.
    function setUp() public {
        agent = vm.addr(agentKey);
        relayer = vm.addr(relayerKey);
        wrongSigner = vm.addr(wrongKey);
        agentNode = keccak256(abi.encodePacked(ownerNode, keccak256(bytes("assistant"))));

        ens = new MockENSRegistry();
        nameWrapper = new MockNameWrapper();
        resolver = new MockResolver();
        valueTarget = new MockValueTarget();
        executor = new AgentEnsExecutor(address(ens), address(nameWrapper));
        taskLog = new TaskLog(address(executor));

        ens.setOwner(agentNode, owner);
        ens.setResolver(agentNode, address(resolver));
        resolver.setAddr(agentNode, agent);
        vm.deal(owner, 10 ether);
    }

    /// @notice Verifies deployments cannot omit the ENS registry authorization source.
    function testConstructorRejectsZeroEnsRegistry() public {
        vm.expectRevert(bytes4(keccak256("ZeroAddress()")));
        new AgentEnsExecutor(address(0), address(nameWrapper));
    }

    /// @notice Verifies deployments cannot omit the NameWrapper used for wrapped-name managers.
    function testConstructorRejectsZeroNameWrapper() public {
        vm.expectRevert(bytes4(keccak256("ZeroAddress()")));
        new AgentEnsExecutor(address(ens), address(0));
    }

    /// @notice Verifies a valid ENS-published policy digest records a task and consumes one nonce.
    function testValidTaskExecutesAgainstEnsPolicyDigest() public {
        AgentEnsExecutor.PolicySnapshot memory policy = _publishActiveTaskLogPolicy(0, 0.01 ether);
        vm.prank(owner);
        executor.depositGasBudget{ value: 1 ether }(agentNode);

        bytes memory callData = _taskCallData("ipfs://demo");
        AgentEnsExecutor.TaskIntent memory intent =
            _intent(policy, callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _sign(agentKey, intent);

        vm.prank(relayer);
        bytes memory result = executor.execute(intent, policy, callData, signature);

        assertEq(abi.decode(result, (uint256)), 0, "task id");
        assertEq(taskLog.taskCount(), 1, "task count");
        assertEq(executor.nextNonce(agentNode), 1, "next nonce");
    }

    /// @notice Verifies changing the ENS policy digest invalidates already signed intents.
    function testChangingEnsPolicyDigestInvalidatesOldIntent() public {
        AgentEnsExecutor.PolicySnapshot memory policy = _publishActiveTaskLogPolicy(0, 0.01 ether);
        vm.prank(owner);
        executor.depositGasBudget{ value: 1 ether }(agentNode);
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentEnsExecutor.TaskIntent memory intent =
            _intent(policy, callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _sign(agentKey, intent);

        resolver.setText(agentNode, "agent.policy.digest", _hex32(bytes32(uint256(0x1234))));

        vm.expectRevert(AgentEnsExecutor.PolicyDigestMismatch.selector);
        executor.execute(intent, policy, callData, signature);
    }

    /// @notice Verifies ENS status is an execution gate independent of the signed intent.
    function testDisabledEnsStatusBlocksExecution() public {
        AgentEnsExecutor.PolicySnapshot memory policy = _publishActiveTaskLogPolicy(0, 0.01 ether);
        vm.prank(owner);
        executor.depositGasBudget{ value: 1 ether }(agentNode);
        resolver.setText(agentNode, "agent.status", "disabled");

        bytes memory callData = _taskCallData("ipfs://demo");
        AgentEnsExecutor.TaskIntent memory intent =
            _intent(policy, callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _sign(agentKey, intent);

        vm.expectRevert(AgentEnsExecutor.PolicyDisabled.selector);
        executor.execute(intent, policy, callData, signature);
    }

    /// @notice Verifies the calldata policy snapshot must hash to the signed and ENS-published digest.
    function testSubmittedPolicySnapshotMustMatchIntentDigest() public {
        AgentEnsExecutor.PolicySnapshot memory policy = _publishActiveTaskLogPolicy(0, 0.01 ether);
        AgentEnsExecutor.PolicySnapshot memory mutated = policy;
        mutated.maxGasReimbursementWei = 0.02 ether;
        vm.prank(owner);
        executor.depositGasBudget{ value: 1 ether }(agentNode);

        bytes memory callData = _taskCallData("ipfs://demo");
        AgentEnsExecutor.TaskIntent memory intent =
            _intent(policy, callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _sign(agentKey, intent);

        vm.expectRevert(AgentEnsExecutor.PolicyDigestMismatch.selector);
        executor.execute(intent, mutated, callData, signature);
    }

    /// @notice Verifies ENS addr(agentNode) remains the signer source of truth.
    function testChangingEnsAddressInvalidatesOldSignature() public {
        AgentEnsExecutor.PolicySnapshot memory policy = _publishActiveTaskLogPolicy(0, 0.01 ether);
        vm.prank(owner);
        executor.depositGasBudget{ value: 1 ether }(agentNode);
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentEnsExecutor.TaskIntent memory intent =
            _intent(policy, callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _sign(agentKey, intent);

        resolver.setAddr(agentNode, wrongSigner);

        vm.expectRevert(AgentEnsExecutor.BadSignature.selector);
        executor.execute(intent, policy, callData, signature);
    }

    /// @notice Verifies the current agent subname manager can withdraw unused gas budget.
    function testAgentSubnameManagerCanWithdrawGasBudget() public {
        vm.prank(owner);
        executor.depositGasBudget{ value: 0.5 ether }(agentNode);

        vm.prank(owner);
        executor.withdrawGasBudget(agentNode, 0.2 ether);

        assertEq(executor.gasBudgetWei(agentNode), 0.3 ether, "remaining budget");
    }

    /// @notice Verifies typoed or deleted ENS nodes cannot receive permanently stuck gas deposits.
    function testCannotDepositGasBudgetForUnownedAgentNode() public {
        bytes32 unownedAgentNode = keccak256("missing.agent");

        vm.expectRevert(AgentEnsExecutor.NotNameOwner.selector);
        executor.depositGasBudget{ value: 0.5 ether }(unownedAgentNode);
    }

    /// @notice Verifies wrapped agent subname managers can withdraw without policy storage.
    function testWrappedAgentSubnameManagerCanWithdrawGasBudget() public {
        ens.setOwner(agentNode, address(nameWrapper));
        nameWrapper.setOwnerOf(uint256(agentNode), owner);
        vm.prank(owner);
        executor.depositGasBudget{ value: 0.5 ether }(agentNode);

        vm.prank(owner);
        executor.withdrawGasBudget(agentNode, 0.2 ether);

        assertEq(executor.gasBudgetWei(agentNode), 0.3 ether, "remaining budget");
    }

    /// @notice Verifies relayer reimbursement cannot exceed the ENS policy cap.
    function testReimbursementIsCapped() public {
        AgentEnsExecutor.PolicySnapshot memory policy = _publishActiveTaskLogPolicy(0, 1 gwei);
        vm.prank(owner);
        executor.depositGasBudget{ value: 1 ether }(agentNode);
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentEnsExecutor.TaskIntent memory intent =
            _intent(policy, callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _sign(agentKey, intent);

        uint256 beforeBalance = relayer.balance;
        vm.txGasPrice(1 gwei);
        vm.prank(relayer);
        executor.execute(intent, policy, callData, signature);
        uint256 reimbursed = relayer.balance - beforeBalance;

        assertLe(reimbursed, policy.maxGasReimbursementWei, "reimbursement cap");
        assertGt(reimbursed, 0, "relayer reimbursed");
    }

    /// @notice Verifies target call value is debited from the same agent budget as reimbursement.
    function testCallValueIsChargedToAgentBudget() public {
        AgentEnsExecutor.PolicySnapshot memory policy = AgentEnsExecutor.PolicySnapshot({
            target: address(valueTarget),
            selector: MockValueTarget.recordValue.selector,
            maxValueWei: uint96(0.2 ether),
            maxGasReimbursementWei: 0,
            expiresAt: uint64(block.timestamp + 1 days),
            enabled: true
        });
        _publishPolicy(policy);
        vm.prank(owner);
        executor.depositGasBudget{ value: 1 ether }(agentNode);

        bytes memory callData = abi.encodeCall(MockValueTarget.recordValue, (agentNode));
        AgentEnsExecutor.TaskIntent memory intent =
            _intent(policy, callData, 0.2 ether, block.timestamp + 1 hours);

        executor.execute(intent, policy, callData, _sign(agentKey, intent));

        assertEq(valueTarget.received(agentNode), 0.2 ether, "target value");
        assertEq(executor.gasBudgetWei(agentNode), 0.8 ether, "value debited");
    }

    /// @notice Verifies malleated high-s signatures cannot pass onchain recovery.
    function testHighSSignatureFails() public {
        AgentEnsExecutor.PolicySnapshot memory policy = _publishActiveTaskLogPolicy(0, 0.01 ether);
        vm.prank(owner);
        executor.depositGasBudget{ value: 1 ether }(agentNode);
        bytes memory callData = _taskCallData("ipfs://demo");
        AgentEnsExecutor.TaskIntent memory intent =
            _intent(policy, callData, 0, block.timestamp + 1 hours);
        bytes memory signature = _malleateHighS(_sign(agentKey, intent));

        vm.expectRevert(AgentEnsExecutor.BadSignature.selector);
        executor.execute(intent, policy, callData, signature);
    }

    /// @notice Publishes an active default TaskLog policy into the ENS text-record mock.
    function _publishActiveTaskLogPolicy(uint96 maxValue, uint96 gasCap)
        private
        returns (AgentEnsExecutor.PolicySnapshot memory policy)
    {
        policy = AgentEnsExecutor.PolicySnapshot({
            target: address(taskLog),
            selector: TaskLog.recordTask.selector,
            maxValueWei: maxValue,
            maxGasReimbursementWei: gasCap,
            expiresAt: uint64(block.timestamp + 1 days),
            enabled: true
        });
        _publishPolicy(policy);
    }

    /// @notice Writes the policy digest and active status exactly as V1 ENS records will.
    function _publishPolicy(AgentEnsExecutor.PolicySnapshot memory policy) private {
        resolver.setText(agentNode, "agent.status", "active");
        resolver.setText(
            agentNode, "agent.policy.digest", _hex32(executor.hashPolicySnapshot(agentNode, policy))
        );
    }

    /// @notice Builds TaskLog.recordTask calldata for the default task.
    function _taskCallData(string memory metadataURI) private view returns (bytes memory) {
        return abi.encodeCall(
            TaskLog.recordTask,
            (agentNode, ownerNode, keccak256("Record wallet health check"), metadataURI)
        );
    }

    /// @notice Builds a TaskIntent for the V1 executor shape including policyDigest.
    function _intent(
        AgentEnsExecutor.PolicySnapshot memory policy,
        bytes memory callData,
        uint256 value,
        uint256 expiresAt
    ) private view returns (AgentEnsExecutor.TaskIntent memory) {
        return AgentEnsExecutor.TaskIntent(
            agentNode,
            executor.hashPolicySnapshot(agentNode, policy),
            policy.target,
            keccak256(callData),
            value,
            executor.nextNonce(agentNode),
            uint64(expiresAt)
        );
    }

    /// @notice Signs a TaskIntent with the same EIP-712 domain used by AgentEnsExecutor.
    function _sign(uint256 privateKey, AgentEnsExecutor.TaskIntent memory intent)
        private
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                executor.TASK_INTENT_TYPEHASH(),
                intent.agentNode,
                intent.policyDigest,
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
                keccak256(bytes("AgentEnsExecutor")),
                keccak256(bytes("1")),
                block.chainid,
                address(executor)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @notice Converts a bytes32 value into the 0x-prefixed ENS text representation.
    function _hex32(bytes32 value) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory output = new bytes(66);
        output[0] = "0";
        output[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            output[2 + i * 2] = alphabet[uint8(value[i] >> 4)];
            output[3 + i * 2] = alphabet[uint8(value[i] & 0x0f)];
        }
        return string(output);
    }

    /// @notice Converts a valid low-s signature into its high-s malleated equivalent.
    function _malleateHighS(bytes memory signature) private pure returns (bytes memory) {
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 highV = v == 27 ? 28 : 27;
        return abi.encodePacked(r, highS, highV);
    }
}
