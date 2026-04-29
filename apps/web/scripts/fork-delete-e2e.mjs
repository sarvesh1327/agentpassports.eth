import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  labelhash,
  namehash,
  parseAbi,
  parseEther
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildAgentDeletePlan } from "../lib/agentDelete.ts";
import { OWNER_INDEX_AGENTS_KEY, OWNER_INDEX_VERSION_KEY } from "../lib/ownerIndex.ts";

const RPC_URL = process.env.FORK_RPC_URL ?? "http://127.0.0.1:8545";
const OWNER_NAME = process.env.FORK_OWNER_NAME ?? "sarvesh.eth";
const AGENT_LABEL = process.env.FORK_DELETE_AGENT_LABEL ?? "delete-e2e";
const AGENT_NAME = `${AGENT_LABEL}.${OWNER_NAME}`;
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const NAME_WRAPPER = "0x0635513f179D50A207757E05759CbD106d7dFcE8";
const PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";
const EXECUTOR = "0x45e6D4230064F9dd806330dA9D92639f8665D9bf";
const DEPLOYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const AGENT = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ensRegistryAbi = parseAbi([
  "function owner(bytes32 node) view returns (address)",
  "function resolver(bytes32 node) view returns (address)",
  "function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl)"
]);
const nameWrapperAbi = parseAbi([
  "function ownerOf(uint256 id) view returns (address)"
]);
const resolverAbi = parseAbi([
  "function text(bytes32 node, string key) view returns (string)",
  "function multicall(bytes[] data) returns (bytes[] results)",
  "function setAddr(bytes32 node, address addr)",
  "function setText(bytes32 node, string key, string value)"
]);
const executorAbi = parseAbi([
  "event GasBudgetWithdrawn(bytes32 indexed agentNode, address to, uint256 amount)",
  "function depositGasBudget(bytes32 agentNode) payable",
  "function gasBudgetWei(bytes32 agentNode) view returns (uint256)"
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
  if (parentRegistryOwner.toLowerCase() === NAME_WRAPPER.toLowerCase()) {
    throw new Error("Delete E2E expects an unwrapped owner name because UI deletion intentionally blocks wrapped names.");
  }
  const manager = parentRegistryOwner;
  const managerClient = walletFor(manager);

  await testClient.setBalance({ address: manager, value: parseEther("10") });
  await testClient.impersonateAccount({ address: manager });

  await waitFor(
    managerClient.writeContract({
      address: ENS_REGISTRY,
      abi: ensRegistryAbi,
      functionName: "setSubnodeRecord",
      args: [ownerNode, labelhash(AGENT_LABEL), manager, PUBLIC_RESOLVER, 0n]
    })
  );
  await waitFor(
    managerClient.writeContract({
      address: PUBLIC_RESOLVER,
      abi: resolverAbi,
      functionName: "multicall",
      args: [
        [
          encodeFunctionData({ abi: resolverAbi, functionName: "setAddr", args: [agentNode, AGENT.address] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [ownerNode, OWNER_INDEX_VERSION_KEY, "1"] }),
          encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [ownerNode, OWNER_INDEX_AGENTS_KEY, `${AGENT_LABEL},assistant`] })
        ]
      ]
    })
  );

  const depositedBudget = parseEther("0.003");
  await waitFor(
    deployerClient.writeContract({
      address: EXECUTOR,
      abi: executorAbi,
      functionName: "depositGasBudget",
      args: [agentNode],
      value: depositedBudget
    })
  );

  const plan = buildAgentDeletePlan({
    agentLabel: AGENT_LABEL,
    agentNode,
    ensRegistryAddress: ENS_REGISTRY,
    executorAddress: EXECUTOR,
    gasBudgetWei: depositedBudget,
    isAgentWrapped: false,
    isOwnerWrapped: false,
    ownerAgentLabels: [AGENT_LABEL, "assistant"],
    ownerNode,
    ownerResolverAddress: PUBLIC_RESOLVER
  });
  if (!plan.canDelete) {
    throw new Error(plan.reason ?? "Delete plan unexpectedly blocked");
  }

  const receipts = [];
  for (const call of plan.calls) {
    receipts.push(await sendRawCall(managerClient, call));
  }

  const budgetAfterDelete = await publicClient.readContract({
    address: EXECUTOR,
    abi: executorAbi,
    functionName: "gasBudgetWei",
    args: [agentNode]
  });
  const agentRegistryOwner = await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: ensRegistryAbi,
    functionName: "owner",
    args: [agentNode]
  });
  const agentResolver = await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: ensRegistryAbi,
    functionName: "resolver",
    args: [agentNode]
  });
  const ownerIndex = await publicClient.readContract({
    address: PUBLIC_RESOLVER,
    abi: resolverAbi,
    functionName: "text",
    args: [ownerNode, OWNER_INDEX_AGENTS_KEY]
  });
  const withdrawEvent = readWithdrawEvent(receipts[0], agentNode);

  await testClient.stopImpersonatingAccount({ address: manager });

  if (budgetAfterDelete !== 0n) {
    throw new Error(`Expected gas budget to be zero after delete, got ${budgetAfterDelete}`);
  }
  if (agentRegistryOwner !== ZERO_ADDRESS || agentResolver !== ZERO_ADDRESS) {
    throw new Error("Expected ENS registry owner and resolver to be cleared after delete");
  }
  if (ownerIndex.split(",").includes(AGENT_LABEL)) {
    throw new Error(`Expected owner index to remove ${AGENT_LABEL}, got ${ownerIndex}`);
  }

  console.log(
    JSON.stringify(
      {
        agentName: AGENT_NAME,
        agentNode,
        deleteCalls: plan.calls.map((call) => call.label),
        executor: EXECUTOR,
        gasBudgetAfterDelete: budgetAfterDelete.toString(),
        ownerIndexAfterDelete: ownerIndex,
        registryOwnerAfterDelete: agentRegistryOwner,
        resolverAfterDelete: agentResolver,
        returnedGasBudget: withdrawEvent.amount.toString(),
        returnedTo: withdrawEvent.to
      },
      null,
      2
    )
  );
}

async function sendRawCall(client, call) {
  const hash = await client.sendTransaction({ data: call.data, to: call.to });
  return publicClient.waitForTransactionReceipt({ hash });
}

async function waitFor(hashPromise) {
  const hash = await hashPromise;
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

function readWithdrawEvent(receipt, expectedAgentNode) {
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({ abi: executorAbi, data: log.data, topics: log.topics });
      if (event.eventName === "GasBudgetWithdrawn" && event.args.agentNode === expectedAgentNode) {
        return { amount: event.args.amount, to: event.args.to };
      }
    } catch {
      // Ignore logs from other contracts in the same transaction.
    }
  }

  throw new Error("Expected GasBudgetWithdrawn event in first delete transaction");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
