import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, defineChain, http } from 'viem';

const repo = '/Users/clawuser/Desktop/agentpassports.eth';
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = { ...loadEnvFile(path.join(process.env.HOME, '.agentPassports/keeperhub.env')), ...loadEnvFile(path.join(repo, '.env')), ...process.env };
const rpcUrl = env.SEPOLIA_RPC_URL || env.RPC_URL || env.NEXT_PUBLIC_RPC_URL;
const policyTarget = process.env.POLICY_TARGET || '0x2EAb7Caba99b35832C6bf9Ef5Bae10A0735CbF5b';
const configuredExecutor = env.NEXT_PUBLIC_EXECUTOR_ADDRESS || env.EXECUTOR_ADDRESS;
const chain = defineChain({ id: 11155111, name: 'Sepolia', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const client = createPublicClient({ chain, transport: http(rpcUrl) });
const executor = await client.readContract({
  address: policyTarget,
  abi: [{ type: 'function', name: 'executor', stateMutability: 'view', inputs: [], outputs: [{ type: 'address', name: '' }] }],
  functionName: 'executor'
});
const codeConfigured = configuredExecutor ? await client.getBytecode({ address: configuredExecutor }) : null;
const codeBound = await client.getBytecode({ address: executor });
console.log(JSON.stringify({ policyTarget, taskLogBoundExecutor: executor, configuredExecutor, configuredMatchesBound: configuredExecutor?.toLowerCase() === executor.toLowerCase(), configuredHasCode: Boolean(codeConfigured), boundHasCode: Boolean(codeBound) }, null, 2));
