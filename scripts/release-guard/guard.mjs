/**
 * BESTEMD Release Guard 1.0. Fail closed: unknown live version, unknown
 * baseline, ambiguous traffic split or older commit blocks publication.
 * Pure functions for unit tests and a separate read-only inventory client.
 */
export const WORKERS = Object.freeze({
  portal: "bestemd-portal",
  office: "bestemd-office",
});
export const SHA = /^[0-9a-f]{40}$/i;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function activeDeployment(payload) {
  if(payload?.success !== true) throw new Error("Cloudflare antwoord niet geverifieerd: publicatie geblokkeerd.");
  const rows = payload?.result?.deployments;
  if(!Array.isArray(rows) || !rows.length) throw new Error("Cloudflare live-deployment onbekend: publicatie geblokkeerd.");
  const deployment = rows[0]; // Cloudflare guarantees newest (serving) first.
  const versions = deployment?.versions;
  if(!Array.isArray(versions)||versions.length!==1 ||
    Number(versions[0]?.percentage)!==100 || !UUID.test(versions[0]?.version_id??""))
    throw new Error("Cloudflare heeft geen eenduidige 100%-versie: publicatie geblokkeerd.");
  if(!UUID.test(deployment.id??"")) throw new Error("Deployment-ID ontbreekt: publicatie geblokkeerd.");
  return Object.freeze({
    deploymentId:deployment.id,
    versionId:versions[0].version_id,
    createdAt:deployment.created_on,
    message:deployment.annotations?.["workers/message"]??null,
  });
}

export function validateRelease({worker,sourceSha,mainSha,baseline,live,isAncestor,approval}) {
  if(!Object.values(WORKERS).includes(worker))throw new Error("Onbekende Worker.");
  if(!SHA.test(sourceSha??"") || !SHA.test(mainSha??""))throw new Error("Git-commit niet betrouwbaar vastgesteld.");
  if(sourceSha!==mainSha)throw new Error("Release is niet de actuele GitHub main: geblokkeerd.");
  if(!baseline || baseline.worker!==worker || !SHA.test(baseline.gitSha??"") ||
    !UUID.test(baseline.versionId??"") || !UUID.test(baseline.deploymentId??""))
    throw new Error("Geen gecontroleerde productie-baseline: geblokkeerd.");
  if(!live || live.versionId!==baseline.versionId || live.deploymentId!==baseline.deploymentId)
    throw new Error("Cloudflare is sinds de inventarisatie gewijzigd: geblokkeerd.");
  if(typeof isAncestor!=="function" || !isAncestor(baseline.gitSha,sourceSha))
    throw new Error("Doelcommit is niet aantoonbaar nieuwer dan de live-baseline: geblokkeerd.");
  if(sourceSha===baseline.gitSha)throw new Error("Dezelfde commit opnieuw publiceren is niet toegestaan.");
  if(approval!=="IK KEUR PRODUCTIE GOED")throw new Error("Expliciete productiegoedkeuring ontbreekt.");
  return Object.freeze({worker,sourceSha,oldVersionId:live.versionId,approved:true});
}
