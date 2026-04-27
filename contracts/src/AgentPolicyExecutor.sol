// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Minimal ENS registry interface used to read name ownership and resolver addresses.
interface IENSRegistry {
    /// @notice Returns the current registry owner for a node.
    /// @param node ENS namehash to inspect.
    /// @return Owner address recorded in the ENS registry.
    function owner(bytes32 node) external view returns (address);

    /// @notice Returns the resolver configured for a node.
    /// @param node ENS namehash to inspect.
    /// @return Resolver contract address.
    function resolver(bytes32 node) external view returns (address);
}

/// @notice Minimal resolver interface for standard coin type 60 EVM address records.
interface IAddrResolver {
    /// @notice Resolves an ENS node to its current EVM address record.
    /// @param node ENS namehash to resolve.
    /// @return EVM address stored on the resolver.
    function addr(bytes32 node) external view returns (address);
}

/// @notice Minimal NameWrapper interface used to determine wrapped-name managers.
interface INameWrapper {
    /// @notice Returns the current owner of a wrapped ENS node token.
    /// @param id Wrapped name token id, equal to uint256(node).
    /// @return Owner address recorded by the NameWrapper.
    function ownerOf(uint256 id) external view returns (address);
}

/// @title AgentPolicyExecutor
/// @notice Executes policy-limited tasks signed by the current ENS-resolved agent address.
contract AgentPolicyExecutor {
    error NotNameOwner();
    error PolicyDisabled();
    error PolicyExpired();
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
    error PolicyNotFound();

    event PolicySet(
        bytes32 indexed ownerNode,
        bytes32 indexed agentNode,
        address ownerWallet,
        address target,
        bytes4 selector,
        uint64 expiresAt
    );
    event PolicyRevoked(bytes32 indexed agentNode);
    event GasBudgetDeposited(bytes32 indexed agentNode, address from, uint256 amount);
    event GasBudgetWithdrawn(bytes32 indexed agentNode, address to, uint256 amount);
    event TaskExecuted(
        bytes32 indexed agentNode,
        address indexed resolvedAgent,
        address indexed target,
        bytes32 callDataHash,
        uint256 nonce,
        uint256 gasReimbursed
    );

    /// @notice Owner-controlled execution policy for one agent ENS node.
    struct Policy {
        bytes32 ownerNode;
        address ownerWallet;
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
        address target;
        bytes32 callDataHash;
        uint256 value;
        uint256 nonce;
        uint64 expiresAt;
    }

    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private constant GAS_OVERHEAD = 30_000;

    bytes32 public constant TASK_INTENT_TYPEHASH = keccak256(
        "TaskIntent(bytes32 agentNode,address target,bytes32 callDataHash,uint256 value,uint256 nonce,uint64 expiresAt)"
    );
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("AgentPolicyExecutor");
    bytes32 private constant VERSION_HASH = keccak256("1");

    IENSRegistry public immutable ens;
    INameWrapper public immutable nameWrapper;

    mapping(bytes32 => Policy) public policies;
    mapping(bytes32 => uint256) public gasBudgetWei;
    mapping(bytes32 => uint256) public nextNonce;

    // Local guard keeps the MVP dependency-light while preserving ReentrancyGuard semantics.
    uint256 private reentrancyStatus = NOT_ENTERED;

    /// @notice Initializes the executor with ENS registry and NameWrapper contracts.
    /// @param ensRegistry ENS registry address used for owner and resolver lookups.
    /// @param nameWrapperAddress ENS NameWrapper address used for wrapped-name ownership checks.
    constructor(address ensRegistry, address nameWrapperAddress) {
        ens = IENSRegistry(ensRegistry);
        nameWrapper = INameWrapper(nameWrapperAddress);
    }

    /// @notice Accepts ETH sent directly for future budget top-ups or operational recovery.
    receive() external payable { }

    /// @dev Prevents reentrant calls around execution and withdrawals.
    modifier nonReentrant() {
        if (reentrancyStatus == ENTERED) revert ReentrantCall();
        reentrancyStatus = ENTERED;
        _;
        reentrancyStatus = NOT_ENTERED;
    }

    /// @notice Creates or replaces an execution policy for an agent subname and optionally funds it.
    /// @dev The caller must control ownerNode, directly or through the ENS NameWrapper.
    /// @param ownerNode ENS namehash for the owner name, such as alice.eth.
    /// @param agentLabel Label used to derive the agent subnode, such as assistant.
    /// @param target Only contract address the agent may call.
    /// @param selector Only function selector the agent may call on target.
    /// @param maxValueWei Maximum ETH value any one intent may send to the target.
    /// @param maxGasReimbursementWei Maximum ETH reimbursed to the relayer per execution.
    /// @param expiresAt Timestamp after which the policy is invalid.
    /// @return agentNode Derived ENS namehash for the agent subname.
    function setPolicy(
        bytes32 ownerNode,
        string calldata agentLabel,
        address target,
        bytes4 selector,
        uint96 maxValueWei,
        uint96 maxGasReimbursementWei,
        uint64 expiresAt
    ) external payable returns (bytes32 agentNode) {
        if (_effectiveManager(ownerNode) != msg.sender) revert NotNameOwner();

        agentNode = keccak256(abi.encodePacked(ownerNode, keccak256(bytes(agentLabel))));
        policies[agentNode] = Policy({
            ownerNode: ownerNode,
            ownerWallet: msg.sender,
            target: target,
            selector: selector,
            maxValueWei: maxValueWei,
            maxGasReimbursementWei: maxGasReimbursementWei,
            expiresAt: expiresAt,
            enabled: true
        });

        if (msg.value > 0) {
            gasBudgetWei[agentNode] += msg.value;
            emit GasBudgetDeposited(agentNode, msg.sender, msg.value);
        }

        emit PolicySet(ownerNode, agentNode, msg.sender, target, selector, expiresAt);
    }

    /// @notice Adds ETH to an agent-specific gas reimbursement budget.
    /// @param agentNode ENS namehash for the funded agent.
    function depositGasBudget(bytes32 agentNode) external payable nonReentrant {
        Policy memory policy = policies[agentNode];
        _requirePolicyExists(policy);
        if (msg.value == 0) revert ZeroAmount();

        gasBudgetWei[agentNode] += msg.value;
        emit GasBudgetDeposited(agentNode, msg.sender, msg.value);
    }

    /// @notice Withdraws unused gas budget to the policy owner or current ENS owner.
    /// @param agentNode ENS namehash for the agent budget.
    /// @param amount Amount of wei to withdraw.
    function withdrawGasBudget(bytes32 agentNode, uint256 amount) external nonReentrant {
        Policy memory policy = policies[agentNode];
        _requirePolicyExists(policy);
        if (msg.sender != policy.ownerWallet && msg.sender != _effectiveManager(policy.ownerNode)) {
            revert NotNameOwner();
        }
        if (gasBudgetWei[agentNode] < amount) revert InsufficientGasBudget();

        gasBudgetWei[agentNode] -= amount;
        (bool ok,) = payable(msg.sender).call{ value: amount }("");
        if (!ok) revert ReimbursementFailed();

        emit GasBudgetWithdrawn(agentNode, msg.sender, amount);
    }

    /// @notice Disables an agent policy so future intents cannot execute.
    /// @param agentNode ENS namehash for the policy to revoke.
    function revokePolicy(bytes32 agentNode) external {
        Policy memory policy = policies[agentNode];
        _requirePolicyExists(policy);
        if (msg.sender != policy.ownerWallet && msg.sender != _effectiveManager(policy.ownerNode)) {
            revert NotNameOwner();
        }

        policies[agentNode].enabled = false;
        emit PolicyRevoked(agentNode);
    }

    /// @notice Executes a signed task intent after live ENS authorization and policy checks.
    /// @dev Resolves addr(agentNode) during this call, so ENS address changes revoke old signers.
    /// @param intent EIP-712 task intent signed by the ENS-published agent address.
    /// @param callData Exact calldata whose hash is committed in intent.callDataHash.
    /// @param signature Agent ECDSA signature over the EIP-712 intent.
    /// @return result Raw return data from the target call.
    function execute(TaskIntent calldata intent, bytes calldata callData, bytes calldata signature)
        external
        nonReentrant
        returns (bytes memory result)
    {
        uint256 gasStart = gasleft();
        Policy memory policy = policies[intent.agentNode];

        if (!policy.enabled) revert PolicyDisabled();
        if (block.timestamp > policy.expiresAt) revert PolicyExpired();
        if (block.timestamp > intent.expiresAt) revert IntentExpired();
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

        uint256 budgetBeforeCall = gasBudgetWei[intent.agentNode];
        if (budgetBeforeCall < intent.value) revert InsufficientGasBudget();

        // ENS is the authorization source: this read happens during every execution.
        address resolvedAgent = _resolveAgentAddress(intent.agentNode);
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

        emit TaskExecuted(
            intent.agentNode,
            resolvedAgent,
            intent.target,
            intent.callDataHash,
            intent.nonce,
            reimbursement
        );
    }

    /// @notice Calls the policy target and consumes the intent nonce.
    /// @dev The nonce write happens before the external call; a target revert rolls it back.
    /// @param intent Authorized task intent.
    /// @param callData Exact calldata to send to the target.
    /// @return returndata Raw returndata from the target call.
    function _callTarget(TaskIntent calldata intent, bytes calldata callData)
        internal
        returns (bytes memory returndata)
    {
        // Advance the nonce before external execution; a revert rolls this back with the call.
        nextNonce[intent.agentNode] = intent.nonce + 1;
        (bool ok, bytes memory result) = intent.target.call{ value: intent.value }(callData);
        if (!ok) revert TargetCallFailed(result);
        return result;
    }

    /// @notice Charges target call value and relayer reimbursement to one agent budget.
    /// @param agentNode ENS namehash for the agent whose budget is charged.
    /// @param intentValue ETH value sent to the target.
    /// @param gasStart Gas left at the beginning of execution.
    /// @param reimbursementCap Maximum reimbursement allowed by the policy.
    /// @param budgetBeforeCall Agent budget snapshot taken before target execution.
    /// @return reimbursement Capped reimbursement amount owed to the relayer.
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

    /// @notice Reverts when no policy has ever been created for an agent node.
    /// @param policy Policy snapshot loaded from storage.
    function _requirePolicyExists(Policy memory policy) internal pure {
        if (policy.ownerWallet == address(0)) revert PolicyNotFound();
    }

    /// @notice Returns the wallet currently allowed to manage an ENS node.
    /// @dev Handles both unwrapped names and names owned by the ENS NameWrapper.
    /// @param node ENS namehash to inspect.
    /// @return Wallet that currently manages the node.
    function _effectiveManager(bytes32 node) internal view returns (address) {
        address registryOwner = ens.owner(node);
        // Wrapped names report the NameWrapper as registry owner; unwrap to the current manager.
        if (registryOwner == address(nameWrapper)) {
            return nameWrapper.ownerOf(uint256(node));
        }
        return registryOwner;
    }

    /// @notice Resolves the current authorized agent signer from ENS.
    /// @param agentNode ENS namehash for the agent identity.
    /// @return Current nonzero addr(agentNode) value.
    function _resolveAgentAddress(bytes32 agentNode) internal view returns (address) {
        address resolver = ens.resolver(agentNode);
        if (resolver == address(0)) revert ResolverNotSet();

        address agent = IAddrResolver(resolver).addr(agentNode);
        if (agent == address(0)) revert AgentAddressNotSet();
        return agent;
    }

    /// @notice Builds the EIP-712 digest for a task intent.
    /// @param intent Task intent to hash.
    /// @return Digest that the agent signer must have signed.
    function _hashIntent(TaskIntent calldata intent) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                TASK_INTENT_TYPEHASH,
                intent.agentNode,
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
    /// @return Domain separator bound to this contract and block.chainid.
    function _domainSeparator() internal view returns (bytes32) {
        // Recompute with block.chainid so signatures cannot silently cross chains.
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
    }

    /// @notice Recovers the signer from a 65-byte ECDSA signature.
    /// @param digest EIP-712 digest that was signed.
    /// @param signature Signature bytes encoded as r, s, v.
    /// @return Recovered signer address, or address(0) for malformed signatures.
    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);

        // Accept the standard 65-byte ECDSA shape used by viem and Foundry signing helpers.
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;

        return ecrecover(digest, v, r, s);
    }

    /// @notice Estimates relayer reimbursement and applies the policy cap.
    /// @param gasStart Gas left at the beginning of execution.
    /// @param cap Maximum reimbursement allowed by the policy.
    /// @return Capped reimbursement amount in wei.
    function _cappedReimbursement(uint256 gasStart, uint96 cap) internal view returns (uint256) {
        // This is a demo reimbursement estimate, bounded by the owner-selected policy cap.
        uint256 gasUsed = gasStart - gasleft() + GAS_OVERHEAD;
        uint256 reimbursement = gasUsed * tx.gasprice;
        if (reimbursement > cap) {
            reimbursement = cap;
        }
        return reimbursement;
    }
}
