// BESTEMD klantworkflow 4.0 — transitions are deliberately independent of UI and storage.
// Historical applications without workflow_version retain their original read path.
export const WORKFLOW_VERSION = 4;
export const WORKFLOW_STAGES = Object.freeze([
  'new_request','introduction','financial_documents','financial_review',
  'quote','quote_discussion','agreement','onboarding',
  'administration_setup','ready_for_activation','active_client',
  'intake','instruction','started','rejected','coaching'
]);
const NEXT = Object.freeze({
  new_request: ['introduction'],
  introduction: ['financial_documents','rejected'],
  financial_documents: ['financial_review'],
  financial_review: ['quote','rejected'],
  quote: ['quote_discussion'],
  quote_discussion: ['agreement','coaching','rejected'],
  agreement: ['onboarding'],
  onboarding: ['administration_setup'],
  administration_setup: ['ready_for_activation'],
  ready_for_activation: ['active_client'],
  active_client: ['intake'],
  intake: ['instruction'],
  instruction: ['started'],
  coaching: [], rejected: [], started: []
});
const required = (condition, message) => { if (!condition) throw new Error(message); };
export function validateCompanyCount(companies) {
  required(Array.isArray(companies) && companies.length >= 1 && companies.length <= 5,
    'Per aanvraag zijn 1 tot en met 5 ondernemingen toegestaan.');
  const ids = companies.map(c => String(c?.id ?? c?.position ?? '').trim());
  required(ids.every(Boolean) && new Set(ids).size === ids.length,
    'Ondernemingsposities moeten uniek zijn.');
  return true;
}
export function canSendOnboarding(workflow) {
  return workflow?.version === WORKFLOW_VERSION &&
    workflow.stage === 'onboarding' &&
    workflow.evidence?.quoteAccepted === true &&
    workflow.evidence?.agreementFullySigned === true;
}
export function canActivateClient(workflow) {
  const e = workflow?.evidence ?? {};
  return workflow?.version === WORKFLOW_VERSION &&
    workflow.stage === 'ready_for_activation' &&
    e.quoteAccepted === true &&
    e.agreementFullySigned === true &&
    e.onboardingSubmitted === true &&
    e.documentsVerified === true &&
    e.administrationReady === true &&
    e.activationApproved === true;
}
export function startWorkflow(actorId, at = new Date().toISOString()) {
  required(typeof actorId === 'string' && actorId.trim(), 'Medewerker ontbreekt.');
  return {version: WORKFLOW_VERSION, stage: 'new_request', evidence: {},
    history: [{from: null, to: 'new_request', actorId, at}]};
}
export function advanceWorkflow(workflow, to, {actorId, evidence = {}, notes = '', at = new Date().toISOString()} = {}) {
  required(workflow?.version === WORKFLOW_VERSION, 'Geen workflow 4.0 dossier.');
  required(typeof actorId === 'string' && actorId.trim(), 'Medewerker ontbreekt.');
  required(NEXT[workflow.stage]?.includes(to), 'Deze statusovergang is niet toegestaan.');
  required(evidence && typeof evidence === 'object' && !Array.isArray(evidence),
    'Ongeldig bewijs van procesvoltooiing.');
  // Evidence must be verified by a trusted server-side integration or an explicitly
  // authorized Office reviewer. Never accept these flags from a public intake form.
  const nextEvidence = {...workflow.evidence, ...evidence};
  const next = {...workflow, evidence: nextEvidence, stage: to,
    history: [...(workflow.history ?? []), {from: workflow.stage, to, actorId, at,
      notes: String(notes).slice(0, 1500)}]};
  if (to === 'onboarding') required(nextEvidence.quoteAccepted === true &&
      nextEvidence.agreementFullySigned === true,
      'Onboarding pas na offerteakkoord en volledig getekende overeenkomst.');
  if (to === 'active_client') required(canActivateClient({...next,stage:'ready_for_activation'}),
      'Activatievoorwaarden zijn niet allemaal vervuld.');
  return next;
}

/**
 * Add weekdays after submission for document follow-up. Dutch public holidays
 * are not automatically inferred; Office can extend the review deadline.
 */
export function documentDeadline(submittedAt, workingDays = 10) {
  const date = new Date(submittedAt);
  required(!Number.isNaN(date.getTime()), 'Ongeldige indieningsdatum.');
  required(Number.isInteger(workingDays) && workingDays >= 1 && workingDays <= 60,
    'Ongeldige aanlevertermijn.');
  let completed = 0;
  while (completed < workingDays) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) completed++;
  }
  return date.toISOString();
}

export const SETUP_CHECKS=Object.freeze([
 'environmentPrepared','accountingConfigured','taxConfigured',
 'bankAccountsRecorded','documentsLinked','permissionsPrepared','pricingLinked'
]);
export function validateAdministrationPreparation(entries,companies){
 validateCompanyCount(companies);
 required(Array.isArray(entries)&&entries.length===companies.length,
  'Controleer de administratie per onderneming.');
 const positions=new Set(companies.map(c=>c.position));
 const seen=new Set();
 const normalized=[];
 for(const entry of entries){
  required(entry&&Number.isInteger(entry.position)&&positions.has(entry.position)&&
   !seen.has(entry.position),'Ongeldige of dubbele onderneming in de voorbereiding.');
  seen.add(entry.position);
  const record={position:entry.position};
  for(const key of SETUP_CHECKS){
   required(typeof entry[key]==='boolean','Alle voorbereidingscontroles moeten zijn ingevuld.');
   record[key]=entry[key];
  }
  normalized.push(record);
 }
 return normalized;
}
export function isAdministrationReady(entries,companies){
 try{
  const rows=validateAdministrationPreparation(entries,companies);
  return rows.every(row=>SETUP_CHECKS.every(key=>row[key]===true));
 }catch{return false;}
}
