// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Minimal ENS registry interface used to read name ownership and resolver addresses.
interface IEnsRegistryV1 {
    /// @notice Returns the current registry owner for a node.
    function owner(bytes32 node) external view returns (address);

    /// @notice Returns the resolver configured for a node.
    function resolver(bytes32 node) external view returns (address);
}

/// @notice Minimal resolver interface for standard coin type 60 EVM address records.
interface IAddrResolverV1 {
    /// @notice Resolves an ENS node to its current EVM address record.
    function addr(bytes32 node) external view returns (address);
}

/// @notice Minimal resolver interface for ENS text records.
interface ITextResolverV1 {
    /// @notice Resolves one text record for an ENS node.
    function text(bytes32 node, string calldata key) external view returns (string memory);
}

/// @notice Minimal NameWrapper interface used to determine wrapped-name managers.
interface INameWrapperV1 {
    /// @notice Returns the current owner of a wrapped ENS node token.
    function ownerOf(uint256 id) external view returns (address);
}

/// @title AgentEnsExecutor
/// @notice Executes ENS-policy-limited tasks signed by the live ENS-resolved agent address.
contract AgentEnsExecutor {
    error NotNameOwner();
    error PolicyDisabled();
    error PolicyExpired();
    error PolicyDigestMismatch();
    error IntentExpired();
    error BadNonce();
    error TargetNotAllowed();
    error SelectorNotAllowed();
    error BadCalldataHash();
    error ValueTooHigh();
    error ResolverNotSet();
    error AgentAddressNotSet();
    error BadSignature();
    error InsufficientGasBudget();
    error ReimbursementFailed();
    error TargetCallFailed(bytes returndata);
    error ReentrantCall();
    error ZeroAmount();
    error ZeroAddress();

    event GasBudgetDeposited(bytes32 indexed agentNode, address from, uint256 amount);
    event GasBudgetWithdrawn(bytes32 indexed agentNode, address to, uint256 amount);
    event TaskExecuted(
        bytes32 indexed agentNode,
        address indexed resolvedAgent,
        address indexed target,
        bytes32 callDataHash,
        bytes32 policyDigest,
        uint256 nonce,
        uint256 gasReimbursed
    );
    event AgentTaskExecuted(
        bytes32 indexed agentNode,
        address indexed target,
        bytes4 selector,
        bytes32 callDataHash,
        bytes32 policyDigest,
        uint256 nonce
    );

    /// @notice Policy fields supplied to execute and accepted only when they match ENS digest.
    struct PolicySnapshot {
        address target;
        bytes4 selector;
        uint96 maxValueWei;
        uint96 maxGasReimbursementWei;
        uint64 expiresAt;
        bool enabled;
    }

    /// @notice EIP-712 intent signed by the agent signer currently published in ENS.
    struct TaskIntent {
        bytes32 agentNode;
        bytes32 policyDigest;
        address target;
        bytes32 callDataHash;
        uint256 value;
        uint256 nonce;
        uint64 expiresAt;
    }

    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private constant GAS_OVERHEAD = 30_000;
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    bytes32 public constant POLICY_SNAPSHOT_TYPEHASH = keccak256(
        "PolicySnapshot(bytes32 agentNode,address target,bytes4 selector,uint96 maxValueWei,uint96 maxGasReimbursementWei,uint64 expiresAt,bool enabled)"
    );
    bytes32 public constant TASK_INTENT_TYPEHASH = keccak256(
        "TaskIntent(bytes32 agentNode,bytes32 policyDigest,address target,bytes32 callDataHash,uint256 value,uint256 nonce,uint64 expiresAt)"
    );
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("AgentEnsExecutor");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes32 private constant ACTIVE_STATUS_HASH = keccak256("active");

    IEnsRegistryV1 public immutable ens;
    INameWrapperV1 public immutable nameWrapper;

    mapping(bytes32 => uint256) public gasBudgetWei;
    mapping(bytes32 => uint256) public nextNonce;

    uint256 private reentrancyStatus = NOT_ENTERED;

    /// @notice Initializes the executor with ENS registry and NameWrapper contracts.
    constructor(address ensRegistry, address nameWrapperAddress) {
        if (ensRegistry == address(0) || nameWrapperAddress == address(0)) revert ZeroAddress();

        ens = IEnsRegistryV1(ensRegistry);
        nameWrapper = INameWrapperV1(nameWrapperAddress);
    }

    /// @notice Accepts ETH sent directly for operational recovery.
    receive() external payable { }

    /// @dev Prevents reentrant calls around execution and withdrawals.
    modifier nonReentrant() {
        if (reentrancyStatus == ENTERED) revert ReentrantCall();
        reentrancyStatus = ENTERED;
        _;
        reentrancyStatus = NOT_ENTERED;
    }

    /// @notice Adds ETH to an agent-specific gas reimbursement budget.
    /// @param agentNode ENS namehash for the funded agent.
    function depositGasBudget(bytes32 agentNode) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        // A gas budget is only recoverable while the agent subname has a current ENS manager.
        if (_effectiveManager(agentNode) == address(0)) revert NotNameOwner();

        gasBudgetWei[agentNode] += msg.value;
        emit GasBudgetDeposited(agentNode, msg.sender, msg.value);
    }

    /// @notice Withdraws unused gas budget to the current manager of the agent ENS subname.
    /// @param agentNode ENS namehash for the agent budget.
    /// @param amount Amount of wei to withdraw.
    function withdrawGasBudget(bytes32 agentNode, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (msg.sender != _effectiveManager(agentNode)) revert NotNameOwner();
        if (gasBudgetWei[agentNode] < amount) revert InsufficientGasBudget();

        gasBudgetWei[agentNode] -= amount;
        (bool ok,) = payable(msg.sender).call{ value: amount }("");
        if (!ok) revert ReimbursementFailed();

        emit GasBudgetWithdrawn(agentNode, msg.sender, amount);
    }

    /// @notice Hashes a policy snapshot into the digest that must be published in ENS.
    /// @param agentNode ENS namehash for the policy owner agent.
    /// @param policy Policy snapshot supplied to execute.
    /// @return Digest to publish in `agent.policy.digest`.
    function hashPolicySnapshot(bytes32 agentNode, PolicySnapshot memory policy)
        public
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                POLICY_SNAPSHOT_TYPEHASH,
                agentNode,
                policy.target,
                policy.selector,
                policy.maxValueWei,
                policy.maxGasReimbursementWei,
                policy.expiresAt,
                policy.enabled
            )
        );
    }

    /// @notice Executes a signed task intent after live ENS identity and policy checks.
    /// @dev Policy is not stored in this contract; it is accepted only if its digest matches ENS.
    function execute(
        TaskIntent calldata intent,
        PolicySnapshot calldata policy,
        bytes calldata callData,
        bytes calldata signature
    ) external nonReentrant returns (bytes memory result) {
        uint256 gasStart = gasleft();
        address resolver = _resolverFor(intent.agentNode);
        address resolvedAgent = _resolveAgentAddress(intent.agentNode, resolver);

        _requireEnsPolicy(intent, policy, resolver);
        _requireIntent(intent, policy, callData);

        uint256 budgetBeforeCall = gasBudgetWei[intent.agentNode];
        if (budgetBeforeCall < intent.value) revert InsufficientGasBudget();

        address recovered = _recover(_hashIntent(intent), signature);
        if (recovered != resolvedAgent) revert BadSignature();

        result = _callTarget(intent, callData);
        uint256 reimbursement = _debitBudget(
            intent.agentNode,
            intent.value,
            gasStart,
            policy.maxGasReimbursementWei,
            budgetBeforeCall
        );

        if (reimbursement > 0) {
            (bool reimbursed,) = payable(msg.sender).call{ value: reimbursement }("");
            if (!reimbursed) revert ReimbursementFailed();
        }

        _emitTaskExecuted(intent, policy.selector, resolvedAgent, reimbursement);
    }

    /// @notice Emits the execution proof from a separate frame to keep execute stack-light.
    function _emitTaskExecuted(
        TaskIntent calldata intent,
        bytes4 selector,
        address resolvedAgent,
        uint256 reimbursement
    ) internal {
        emit TaskExecuted(
            intent.agentNode,
            resolvedAgent,
            intent.target,
            intent.callDataHash,
            intent.policyDigest,
            intent.nonce,
            reimbursement
        );
        emit AgentTaskExecuted(
            intent.agentNode,
            intent.target,
            selector,
            intent.callDataHash,
            intent.policyDigest,
            intent.nonce
        );
    }

    /// @notice Verifies ENS-published status and policy digest against the submitted snapshot.
    function _requireEnsPolicy(
        TaskIntent calldata intent,
        PolicySnapshot calldata policy,
        address resolver
    ) internal view {
        string memory status = ITextResolverV1(resolver).text(intent.agentNode, "agent_status");
        if (keccak256(bytes(status)) != ACTIVE_STATUS_HASH) revert PolicyDisabled();

        bytes32 computedPolicyDigest = hashPolicySnapshot(intent.agentNode, policy);
        bytes32 ensPolicyDigest = _readEnsPolicyDigest(resolver, intent.agentNode);
        if (computedPolicyDigest != intent.policyDigest || computedPolicyDigest != ensPolicyDigest)
        {
            revert PolicyDigestMismatch();
        }
        if (!policy.enabled) revert PolicyDisabled();
        if (block.timestamp > policy.expiresAt) revert PolicyExpired();
    }

    /// @notice Verifies nonce, expiry, target, selector, calldata commitment, and value limit.
    function _requireIntent(
        TaskIntent calldata intent,
        PolicySnapshot calldata policy,
        bytes calldata callData
    ) internal view {
        if (block.timestamp > intent.expiresAt) {
            revert IntentExpired();
        }
        if (intent.nonce != nextNonce[intent.agentNode]) revert BadNonce();
        if (intent.target != policy.target) revert TargetNotAllowed();
        if (callData.length < 4) revert SelectorNotAllowed();

        bytes4 selector;
        assembly {
            selector := calldataload(callData.offset)
        }
        if (selector != policy.selector) revert SelectorNotAllowed();
        if (keccak256(callData) != intent.callDataHash) revert BadCalldataHash();
        if (intent.value > policy.maxValueWei) revert ValueTooHigh();
    }

    /// @notice Calls the policy target and consumes the intent nonce.
    function _callTarget(TaskIntent calldata intent, bytes calldata callData)
        internal
        returns (bytes memory returndata)
    {
        nextNonce[intent.agentNode] = intent.nonce + 1;
        (bool ok, bytes memory result) = intent.target.call{ value: intent.value }(callData);
        if (!ok) revert TargetCallFailed(result);
        return result;
    }

    /// @notice Charges target call value and relayer reimbursement to one agent budget.
    function _debitBudget(
        bytes32 agentNode,
        uint256 intentValue,
        uint256 gasStart,
        uint96 reimbursementCap,
        uint256 budgetBeforeCall
    ) internal returns (uint256 reimbursement) {
        reimbursement = _cappedReimbursement(gasStart, reimbursementCap);
        uint256 totalDebit = intentValue + reimbursement;
        if (budgetBeforeCall < totalDebit) revert InsufficientGasBudget();
        gasBudgetWei[agentNode] = budgetBeforeCall - totalDebit;
    }

    /// @notice Reads and validates the ENS resolver for an agent node.
    function _resolverFor(bytes32 agentNode) internal view returns (address resolver) {
        resolver = ens.resolver(agentNode);
        if (resolver == address(0)) revert ResolverNotSet();
    }

    /// @notice Resolves the current authorized agent signer from ENS.
    function _resolveAgentAddress(bytes32 agentNode, address resolver)
        internal
        view
        returns (address)
    {
        address agent = IAddrResolverV1(resolver).addr(agentNode);
        if (agent == address(0)) revert AgentAddressNotSet();
        return agent;
    }

    /// @notice Returns the wallet currently allowed to manage an ENS node.
    function _effectiveManager(bytes32 node) internal view returns (address) {
        address registryOwner = ens.owner(node);
        if (registryOwner == address(nameWrapper)) {
            return nameWrapper.ownerOf(uint256(node));
        }
        return registryOwner;
    }

    /// @notice Reads the 0x-prefixed policy digest text record from ENS.
    function _readEnsPolicyDigest(address resolver, bytes32 agentNode)
        internal
        view
        returns (bytes32)
    {
        (bool ok, bytes32 digest) =
            _parseBytes32(ITextResolverV1(resolver).text(agentNode, "agent_policy_digest"));
        if (!ok) revert PolicyDigestMismatch();
        return digest;
    }

    /// @notice Parses a 66-byte 0x-prefixed bytes32 hex string.
    function _parseBytes32(string memory value) internal pure returns (bool ok, bytes32 parsed) {
        bytes memory input = bytes(value);
        if (input.length != 66 || input[0] != "0" || (input[1] != "x" && input[1] != "X")) {
            return (false, bytes32(0));
        }

        uint256 accumulator;
        for (uint256 i = 2; i < 66; i++) {
            uint8 nibble = _hexNibble(uint8(input[i]));
            if (nibble > 15) return (false, bytes32(0));
            accumulator = (accumulator << 4) | nibble;
        }
        return (true, bytes32(accumulator));
    }

    /// @notice Converts one ASCII hex character into a nibble, or 16 when invalid.
    function _hexNibble(uint8 char) internal pure returns (uint8) {
        if (char >= 48 && char <= 57) return char - 48;
        if (char >= 65 && char <= 70) return char - 55;
        if (char >= 97 && char <= 102) return char - 87;
        return 16;
    }

    /// @notice Builds the EIP-712 digest for a task intent.
    function _hashIntent(TaskIntent calldata intent) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                TASK_INTENT_TYPEHASH,
                intent.agentNode,
                intent.policyDigest,
                intent.target,
                intent.callDataHash,
                intent.value,
                intent.nonce,
                intent.expiresAt
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    /// @notice Computes the EIP-712 domain separator for this executor on the current chain.
    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
    }

    /// @notice Recovers the signer from a 65-byte ECDSA signature.
    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        if (uint256(s) > SECP256K1_HALF_ORDER) return address(0);

        return ecrecover(digest, v, r, s);
    }

    /// @notice Estimates relayer reimbursement and applies the policy cap.
    function _cappedReimbursement(uint256 gasStart, uint96 cap) internal view returns (uint256) {
        uint256 gasUsed = gasStart - gasleft() + GAS_OVERHEAD;
        uint256 reimbursement = gasUsed * tx.gasprice;
        if (reimbursement > cap) {
            reimbursement = cap;
        }
        return reimbursement;
    }
}
