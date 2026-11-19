#!/usr/bin/env node
/** Verification only. NEVER invokes wrangler deploy or changes Cloudflare. */
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WORKERS,activeDeployment,validateRelease } from "./guard.mjs";

const workerKey=process.argv[2];
if(!Object.hasOwn(WORKERS,workerKey)) {
 console.error("Gebruik: node scripts/release-guard/check.mjs portal|office");
 process.exit(2);
}
const baselinePath=fileURLToPath(new URL("../../.bestemd/release-baselines.json",import.meta.url));
const configuration=JSON.parse(readFileSync(baselinePath,"utf8"));
const baseline=configuration[workerKey];
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!/^[0-9a-f]{32}$/i.test(account??"")||!token)throw new Error("Cloudflare credentials ontbreken: release geweigerd.");
const sourceSha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const remote=execFileSync("git",["ls-remote","origin","refs/heads/main"],{encoding:"utf8"}).trim();
const mainSha=remote.split(/\s+/)[0]??"";
const ancestor=(from,to)=>spawnSync("git",["merge-base","--is-ancestor",from,to],{stdio:"ignore"}).status===0;

const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${WORKERS[workerKey]}/deployments?per_page=1`,{
 headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},signal:AbortSignal.timeout(15000)
});
if(!response.ok)throw new Error("Cloudflare live status niet bereikbaar: release geweigerd.");
const live=activeDeployment(await response.json());
validateRelease({
 worker:WORKERS[workerKey],sourceSha,mainSha,baseline,live,isAncestor:ancestor,
 approval:process.env.BESTEMD_APPROVAL
});
console.log("[OK] Release Guard verificatie geslaagd voor "+WORKERS[workerKey]);
console.log("Git SHA: "+sourceSha);
console.log("Actuele live Worker versie: "+live.versionId);
console.log("Let op: deze opdracht voert geen deployment uit.");
