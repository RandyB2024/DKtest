import test from "node:test";
import assert from "node:assert/strict";
import {activeDeployment,validateRelease} from "./guard.mjs";
const baseline={worker:"bestemd-portal",gitSha:"a".repeat(40),versionId:"023e105f-2a42-4f8b-a1c1-73f6a2a30c0f",deploymentId:"182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e"};
const live={versionId:baseline.versionId,deploymentId:baseline.deploymentId};
const mainSha="b".repeat(40);
const valid={worker:"bestemd-portal",sourceSha:mainSha,mainSha,baseline,live,isAncestor:()=>true,approval:"IK KEUR PRODUCTIE GOED"};
test("Cloudflare live versies worden exact en read-only herkend",()=>{
 const current={id:baseline.deploymentId,created_on:"2026-11-19T10:00:00Z",versions:[{version_id:baseline.versionId,percentage:100}]};
 const older={...current,id:"11111111-1111-1111-1111-111111111111",created_on:"2026-11-18T10:00:00Z"};
 const x=activeDeployment({success:true,result:{deployments:[current]}});
 assert.equal(x.versionId,baseline.versionId);
 // Wrangler JSON and Cloudflare API can be ordered differently.
 assert.equal(activeDeployment({success:true,result:{deployments:[older,current]}}).deploymentId,baseline.deploymentId);
 assert.equal(activeDeployment({success:true,result:{deployments:[current,older]}}).deploymentId,baseline.deploymentId);
 assert.equal(activeDeployment({success:true,result:[older,current]}).deploymentId,baseline.deploymentId);
 assert.throws(()=>activeDeployment({success:true,result:{deployments:[]}}),/onbekend/);
 assert.throws(()=>activeDeployment({success:true,result:{deployments:[{...current,created_on:null}]}}),/datum/);
 assert.throws(()=>activeDeployment({success:true,result:{deployments:[{...current,versions:[{version_id:baseline.versionId,percentage:90},{version_id:"11111111-1111-1111-1111-111111111111",percentage:10}]}]}}),/eenduidige/);
});
test("nieuwere goedgekeurde main-commit mag door de guard",()=>{
 assert.equal(validateRelease(valid).approved,true);
});
test("oude commit wordt geweigerd",()=>{
 assert.throws(()=>validateRelease({...valid,isAncestor:()=>false}),/niet aantoonbaar nieuwer/);
});
test("losse oude branch wordt geweigerd",()=>{
 assert.throws(()=>validateRelease({...valid,sourceSha:"c".repeat(40)}),/niet de actuele GitHub main/);
});
test("onbekende live-baseline wordt geweigerd",()=>{
 assert.throws(()=>validateRelease({...valid,baseline:null}),/Geen gecontroleerde/);
});
test("Cloudflare afwijking sinds inspectie wordt geweigerd",()=>{
 assert.throws(()=>validateRelease({...valid,live:{...live,versionId:"11111111-1111-1111-1111-111111111111"}}),/sinds de inventarisatie gewijzigd/);
});
test("opnieuw dezelfde commit mag niet live",()=>{
 assert.throws(()=>validateRelease({...valid,sourceSha:baseline.gitSha,mainSha:baseline.gitSha}),/Dezelfde commit/);
});
test("geen publicatie zonder expliciete goedkeuring",()=>{
 assert.throws(()=>validateRelease({...valid,approval:""}),/goedkeuring ontbreekt/);
});
test("onbekende worker kan nooit Office overschrijven",()=>{
 assert.throws(()=>validateRelease({...valid,worker:"other"}),/Onbekende Worker/);
});
