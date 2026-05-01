import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, namehash } from 'viem';
import { sepolia } from 'viem/chains';
const repo=path.resolve(process.cwd(), '../..');
function load(file){const out={}; if(!fs.existsSync(file)) return out; for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if(m){let v=m[2]; if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); out[m[1]]=v;}} return out;}
const env={...load(path.join(repo,'.env')),...process.env};
const rpc=env.SEPOLIA_RPC_URL || env.NEXT_PUBLIC_RPC_URL;
const client=createPublicClient({chain:sepolia, transport:http(rpc)});
const registry='0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const candidates=['assistant.sarvesh.eth','clawdirt.sarvesh.eth','hermes.sarvesh.eth','paperclip.sarvesh.eth','assistant.agentpassports.eth','helper.agentpassports.eth','directory.agentpassports.eth','manual.agentpassports.eth','reverse.agentpassports.eth','clawdirt.agentpassports.eth','hermes.agentpassports.eth','paperclip.agentpassports.eth'];
const registryAbi=[{type:'function',name:'resolver',stateMutability:'view',inputs:[{name:'node',type:'bytes32'}],outputs:[{name:'resolver',type:'address'}]}];
const resolverAbi=[
  {type:'function',name:'addr',stateMutability:'view',inputs:[{name:'node',type:'bytes32'}],outputs:[{name:'addr',type:'address'}]},
  {type:'function',name:'text',stateMutability:'view',inputs:[{name:'node',type:'bytes32'},{name:'key',type:'string'}],outputs:[{name:'value',type:'string'}]},
];
for(const name of candidates){
  const node=namehash(name);
  const row={name,node,resolver:null,addr:null,texts:{}};
  try{row.resolver=await client.readContract({address:registry,abi:registryAbi,functionName:'resolver',args:[node]});}catch(e){row.resolver='ERR:'+(e.shortMessage||e.message);}
  if(row.resolver && /^0x[0-9a-fA-F]{40}$/.test(row.resolver) && row.resolver.toLowerCase()!=='0x0000000000000000000000000000000000000000'){
    try{row.addr=await client.readContract({address:row.resolver,abi:resolverAbi,functionName:'addr',args:[node]});}catch(e){row.addr='ERR:'+(e.shortMessage||e.message);}
    for(const key of ['agent_status','agent_policy_digest','agent_policy_target','agent_policy_selector','agent_policy_max_value','agent_policy_expires_at']){
      try{row.texts[key]=await client.readContract({address:row.resolver,abi:resolverAbi,functionName:'text',args:[node,key]});}catch(e){row.texts[key]='ERR:'+(e.shortMessage||e.message);}
    }
  }
  console.log(JSON.stringify(row));
}
