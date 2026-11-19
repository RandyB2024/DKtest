// Intake 4.0: explicit missing-document checklist, never equivalent to verification.
export const PERSONAL_REQUIRED = Object.freeze(['Aangifte inkomstenbelasting','Identiteitsbewijs ondernemer']);
export const COMPANY_REQUIRED = Object.freeze(['KvK-uittreksel','Jaarrekening','Kolommenbalans']);
export const categoryOf = document => String(document?.filename||'').split(' - ')[0].trim();
export function prospectDocumentChecklist(documents,companies) {
 const all = Array.isArray(documents) ? documents : [];
 const personalDocs = all.filter(d=>PERSONAL_REQUIRED.includes(categoryOf(d)));
 const seenPersonal=new Set(personalDocs.map(categoryOf));
 const missingPersonalDocuments=PERSONAL_REQUIRED.filter(k=>!seenPersonal.has(k));
 const companyRows=(Array.isArray(companies)?companies:[]).map(company=>{
  const companyPosition=Number(company?.position);
  const received=all.filter(d=>Number(d.company_position)===companyPosition &&
    !PERSONAL_REQUIRED.includes(categoryOf(d)));
  const present=new Set(received.map(categoryOf));
  const settings=company?.company_data||{};
  const administration=settings.administrativeOnboarding||{};
  const requiresVat=(administration.vatRequired??settings.vatRequired)==='yes';
  const required=[...COMPANY_REQUIRED,...(requiresVat?['Btw-aangifte']:[])];
  return {position:companyPosition,documents:received,
    missingDocuments:required.filter(k=>!present.has(k)),
    kvkIssueDateRequiresReview:present.has('KvK-uittreksel')};
 });
 return {personalDocuments:personalDocs,missingPersonalDocuments:missingPersonalDocuments,
  companyDocuments:companyRows,
  documentsSupplied:missingPersonalDocuments.length===0 &&
    companyRows.length>0 && companyRows.every(c=>c.missingDocuments.length===0),
  // Supplier completion is NOT proof of validity; signed agreements/identity must
  // be reviewed by staff and official KvK date by actual document issuance date.
  documentsVerified:false};
}
