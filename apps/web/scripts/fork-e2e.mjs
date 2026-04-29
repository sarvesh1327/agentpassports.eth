import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeFunctionData,
  getContractError,
  hashTypedData,
  http,
  keccak256,
  labelhash,
  namehash,
  parseEther,
  parseGwei,
  parseAbi,
  toHex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildTaskIntentTypedData,
  hashCallData,
  hashPolicySnapshot,
  taskLogRecordTaskSelector
} from "../../../packages/config/src/index.ts";

const RPC_URL = process.env.FORK_RPC_URL ?? "http://127.0.0.1:8545";
const OWNER_NAME = process.env.FORK_OWNER_NAME ?? "sarvesh.eth";
const AGENT_LABEL = process.env.FORK_AGENT_LABEL ?? "assistant";
const AGENT_NAME = `${AGENT_LABEL}.${OWNER_NAME}`;
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const NAME_WRAPPER = "0x0635513f179D50A207757E05759CbD106d7dFcE8";
const PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";
const EXECUTOR = "0x45e6D4230064F9dd806330dA9D92639f8665D9bf";
const TASK_LOG = "0xCC8eFf4Ad952dE82990264D5ADB32Fc9399ECb64";
const DEPLOYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const AGENT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const RELAYER = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367e2e68ca870fc3fb9a804cdab365a");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ensRegistryAbi = parseAbi([
  "function owner(bytes32 node) view returns (address)",
  "function resolver(bytes32 node) view returns (address)",
  "function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl)"
]);
const nameWrapperAbi = parseAbi([
  "function ownerOf(uint256 id) view returns (address)",
  "function setSubnodeRecord(bytes32 parentNode, string label, address owner, address resolver, uint64 ttl, uint32 fuses, uint64 expiry)"
]);
const resolverAbi = parseAbi([
  "function addr(bytes32 node) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
  "function multicall(bytes[] data) returns (bytes[] results)",
  "function setAddr(bytes32 node, address addr)",
  "function setText(bytes32 node, string key, string value)"
]);
const executorAbi = parseAbi([
  "error PolicyDisabled()",
  "function depositGasBudget(bytes32 agentNode) payable",
  "function execute((bytes32 agentNode,bytes32 policyDigest,address target,bytes32 callDataHash,uint256 value,uint256 nonce,uint64 expiresAt) intent,(address target,bytes4 selector,uint96 maxValueWei,uint96 maxGasReimbursementWei,uint64 expiresAt,bool enabled) policy,bytes callData,bytes signature) returns (bytes)",
  "function gasBudgetWei(bytes32 agentNode) view returns (uint256)",
  "function nextNonce(bytes32 agentNode) view returns (uint256)"
]);
const taskLogAbi = parseAbi([
  "function executor() view returns (address)",
  "function recordTask(bytes32 agentNode, bytes32 ownerNode, bytes32 taskHash, string metadataURI) returns (uint256)",
  "function taskCount() view returns (uint256)"
]);

const localChain = {
  id: 31337,
  name: "Anvil Sepolia Fork",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: { default: { http: [RPC_URL] } }
};

const publicClient = createPublicClient({ chain: localChain, transport: http(RPC_URL) });
const testClient = createTestClient({ chain: localChain, mode: "anvil", transport: http(RPC_URL) });
const deployerClient = createWalletClient({ account: DEPLOYER, chain: localChain, transport: http(RPC_URL) });
const relayerClient = createWalletClient({ account: RELAYER, chain: localChain, transport: http(RPC_URL) });

function walletFor(address) {
  return createWalletClient({ account: address, chain: localChain, transport: http(RPC_URL) });
}

async function main() {
  const ownerNode = namehash(OWNER_NAME);
  const agentNode = namehash(AGENT_NAME);
  const parentRegistryOwner = await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: ensRegistryAbi,
    functionName: "owner",
    args: [ownerNode]
  });
  const manager = await effectiveManager(ownerNode, parentRegistryOwner);
  if (manager === ZERO_ADDRESS) {
    throw new Error(`${OWNER_NAME} has no ENS manager on the fork`);
  }

  await testClient.setBalance({ address: manager, value: parseEther("10") });
  await testClient.setBalance({ address: RELAYER.address, value: parseEther("10") });
  await testClient.impersonateAccount({ address: manager });
  const managerClient = walletFor(manager);

  await createOrOverwriteAgentSubname({
    agentNode,
    manager,
    managerClient,
    ownerNode,
    parentRegistryOwner
  });

  const block = await publicClient.getBlock();
  const policy = {
    target: TASK_LOG,
    selector: taskLogRecordTaskSelector(),
    maxValueWei: 0n,
    maxGasReimbursementWei: parseGwei("0.0002"),
    expiresAt: BigInt(block.timestamp) + 7n * 24n * 60n * 60n,
    enabled: true
  };
  const policyDigest = hashPolicySnapshot(agentNode, policy);
  await writeAgentRecords({ agentNode, managerClient, ownerNode, policy, policyDigest });

  await waitFor(
    deployerClient.writeContract({
      address: EXECUTOR,
      abi: executorAbi,
      functionName: "depositGasBudget",
      args: [agentNode],
      value: parseEther("0.01")
    })
  );

  const taskHash = keccak256(toHex("fork-e2e-task"));
  const callData = encodeFunctionData({
    abi: taskLogAbi,
    functionName: "recordTask",
    args: [agentNode, ownerNode, taskHash, "ipfs://fork-e2e-task"]
  });
  const currentNonce = await publicClient.readContract({
    address: EXECUTOR,
    abi: executorAbi,
    functionName: "nextNonce",
    args: [agentNode]
  });
  const intent = {
    agentNode,
    policyDigest,
    target: TASK_LOG,
    callDataHash: hashCallData(callData),
    value: 0n,
    nonce: currentNonce,
    expiresAt: BigInt(block.timestamp) + 60n * 60n
  };
  const typedData = buildTaskIntentTypedData(intent, BigInt(localChain.id), EXECUTOR);
  const signature = await AGENT.signTypedData(typedData);

  await waitFor(
    relayerClient.writeContract({
      address: EXECUTOR,
      abi: executorAbi,
      functionName: "execute",
      args: [intent, policy, callData, signature]
    })
  );

  const nextNonceAfterRun = await publicClient.readContract({
    address: EXECUTOR,
    abi: executorAbi,
    functionName: "nextNonce",
    args: [agentNode]
  });
  const taskCountAfterRun = await publicClient.readContract({
    address: TASK_LOG,
    abi: taskLogAbi,
    functionName: "taskCount"
  });

  await writeAgentStatus({ agentNode, managerClient, status: "disabled" });

  const disabledIntent = { ...intent, nonce: nextNonceAfterRun, expiresAt: BigInt(block.timestamp) + 2n * 60n * 60n };
  const disabledTypedData = buildTaskIntentTypedData(disabledIntent, BigInt(localChain.id), EXECUTOR);
  const disabledSignature = await AGENT.signTypedData(disabledTypedData);
  const revokeRejection = await readRevokeRejection({
    agentNode,
    callData,
    intent: disabledIntent,
    policy,
    signature: disabledSignature
  });

  const taskLogExecutor = await publicClient.readContract({
    address: TASK_LOG,
    abi: taskLogAbi,
    functionName: "executor"
  });
  const remainingBudget = await publicClient.readContract({
    address: EXECUTOR,
    abi: executorAbi,
    functionName: "gasBudgetWei",
    args: [agentNode]
  });

  await testClient.stopImpersonatingAccount({ address: manager });

  console.log(
    JSON.stringify(
      {
        agentAddress: AGENT.address,
        agentName: AGENT_NAME,
        agentNode,
        executor: EXECUTOR,
        manager,
        ownerName: OWNER_NAME,
        policyDigest,
        remainingBudget: remainingBudget.toString(),
        revokeRejection,
        taskCountAfterRun: taskCountAfterRun.toString(),
        taskLog: TASK_LOG,
        taskLogExecutor,
        nextNonceAfterRun: nextNonceAfterRun.toString()
      },
      null,
      2
    )
  );
}

async function effectiveManager(node, registryOwner) {
  if (registryOwner.toLowerCase() !== NAME_WRAPPER.toLowerCase()) {
    return registryOwner;
  }

  return publicClient.readContract({
    address: NAME_WRAPPER,
    abi: nameWrapperAbi,
    functionName: "ownerOf",
    args: [BigInt(node)]
  });
}

async function createOrOverwriteAgentSubname(input) {
  if (input.parentRegistryOwner.toLowerCase() === NAME_WRAPPER.toLowerCase()) {
    await waitFor(
      input.managerClient.writeContract({
        address: NAME_WRAPPER,
        abi: nameWrapperAbi,
        functionName: "setSubnodeRecord",
        args: [input.ownerNode, AGENT_LABEL, input.manager, PUBLIC_RESOLVER, 0n, 0, 0n]
      })
    );
    return;
  }

  await waitFor(
    input.managerClient.writeContract({
      address: ENS_REGISTRY,
      abi: ensRegistryAbi,
      functionName: "setSubnodeRecord",
      args: [input.ownerNode, labelhash(AGENT_LABEL), input.manager, PUBLIC_RESOLVER, 0n]
    })
  );
}

async function writeAgentRecords(input) {
  await waitFor(
    input.managerClient.writeContract({
      address: PUBLIC_RESOLVER,
      abi: resolverAbi,
      functionName: "multicall",
      args: [
        [
          encodeFunctionData({ abi: resolverAbi, functionName: "setAddr", args: [input.agentNode, AGENT.address] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [input.agentNode, "agent.v", "2"] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [input.agentNode, "agent.owner", OWNER_NAME] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [input.agentNode, "agent.status", "active"] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [input.agentNode, "agent.policy.digest", input.policyDigest] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [input.agentNode, "agent.policy.target", input.policy.target] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [input.agentNode, "agent.policy.selector", input.policy.selector] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [input.agentNode, "agent.policy.maxValueWei", input.policy.maxValueWei.toString()] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [input.agentNode, "agent.policy.maxGasReimbursementWei", input.policy.maxGasReimbursementWei.toString()] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [input.agentNode, "agent.policy.expiresAt", input.policy.expiresAt.toString()] })
        ]
      ]
    })
  );
}

async function writeAgentStatus(input) {
  await waitFor(
    input.managerClient.writeContract({
      address: PUBLIC_RESOLVER,
      abi: resolverAbi,
      functionName: "setText",
      args: [input.agentNode, "agent.status", input.status]
    })
  );
}

async function readRevokeRejection(input) {
  try {
    await publicClient.simulateContract({
      account: RELAYER.address,
      address: EXECUTOR,
      abi: executorAbi,
      functionName: "execute",
      args: [input.intent, input.policy, input.callData, input.signature]
    });
  } catch (error) {
    const contractError = getContractError(error, { abi: executorAbi });
    const liveStatus = await publicClient.readContract({
      address: PUBLIC_RESOLVER,
      abi: resolverAbi,
      functionName: "text",
      args: [input.agentNode, "agent.status"]
    });
    if (liveStatus === "disabled" && contractError.shortMessage.includes("reverted")) {
      return "agent.status=disabled rejected execute()";
    }
    return contractError.shortMessage;
  }

  throw new Error("Expected disabled ENS status to reject execution");
}

async function waitFor(hashPromise) {
  const hash = await hashPromise;
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
