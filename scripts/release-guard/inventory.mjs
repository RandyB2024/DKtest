#!/usr/bin/env node
/** Read-only Cloudflare Worker version inventory; never modifies Workers. */
import { WORKERS, activeDeployment } from "./guard.mjs";

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[0-9a-f]{32}$/i.test(account??"")||!token) {
 console.error("Geen Cloudflare account/token beschikbaar. Geen inventarisatie; er wordt niets gewijzigd.");
 process.exit(2);
}
const out={checkedAt:new Date().toISOString(),workers:[]};
for(const [area,worker] of Object.entries(WORKERS)) {
 try {
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/deployments?per_page=100`;
  const response=await fetch(endpoint,{
    headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},
    signal:AbortSignal.timeout(15000),cache:"no-store"
  });
  if(!response.ok)throw new Error(`Cloudflare API HTTP ${response.status}`);
  const live=activeDeployment(await response.json());
  out.workers.push({area,worker,...live});
 }catch(error) {
  console.error(`[STOP] ${worker}: ${error instanceof Error?error.message:"onbekend probleem"}`);
  process.exitCode=1;
 }
}
console.log(JSON.stringify(out,null,2));
if(out.workers.length!==Object.keys(WORKERS).length)process.exitCode=1;
