import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, defineChain, http, namehash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const repo='/Users/clawuser/Desktop/agentpassports.eth';
function loadEnvFile(file){ if(!fs.existsSync(file)) return {}; const out={}; for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){ const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if(!m) continue; let v=m[2].trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); out[m[1]]=v; } return out; }
const env={...loadEnvFile(path.join(repo,'.env')), ...process.env};
const rpc=env.SEPOLIA_RPC_URL||env.RPC_URL||env.NEXT_PUBLIC_RPC_URL;
const registry=env.NEXT_PUBLIC_ENS_REGISTRY||env.ENS_REGISTRY||'0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const chain=defineChain({id:11155111,name:'Sepolia',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpc]}}});
const client=createPublicClient({chain,transport:http(rpc)});
const registryAbi=[{type:'function',name:'resolver',stateMutability:'view',inputs:[{name:'node',type:'bytes32'}],outputs:[{name:'resolver',type:'address'}]}];
const resolverAbi=[{type:'function',name:'addr',stateMutability:'view',inputs:[{name:'node',type:'bytes32'}],outputs:[{name:'agentAddress',type:'address'}]}];
const agentName='claw.sarvesh.eth';
const node=namehash(agentName);
const resolver=await client.readContract({address:registry,abi:registryAbi,functionName:'resolver',args:[node]});
const ensAddr=await client.readContract({address:resolver,abi:resolverAbi,functionName:'addr',args:[node]});
const privateCandidates=[];
for (const k of ['AGENT_PRIVATE_KEY','PRIVATE_KEY','RELAYER_PRIVATE_KEY']) if(env[k]) privateCandidates.push([k, env[k]]);
const keyFile=path.join(process.env.HOME,'.agentPassports/keys.txt');
if (fs.existsSync(keyFile)) {
  let i=0;
  for (const token of fs.readFileSync(keyFile,'utf8').split(/\s+/).filter(Boolean)) {
    if (/^0x[0-9a-fA-F]{64}$/.test(token)) privateCandidates.push([`keys.txt#${++i}`, token]);
  }
}
const rows=[];
for (const [label,pk] of privateCandidates) {
  try { const acct=privateKeyToAccount(pk); rows.push({label,address:acct.address,matches:acct.address.toLowerCase()===String(ensAddr).toLowerCase()}); }
  catch(e){ rows.push({label,address:'invalid-private-key',matches:false}); }
}
console.log(JSON.stringify({agentName,resolver,ensAddress:ensAddr,candidates:rows},null,2));