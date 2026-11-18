// BESTEMD prospect — keep internal agreement evidence and workflow notes private.
export function isOfficeAgreementName(filename){
 return /^Overeenkomst van opdracht - /i.test(String(filename||''));
}
export function publicProspectDocuments(documents){
 return (Array.isArray(documents)?documents:[])
  .filter(document=>!isOfficeAgreementName(document?.filename));
}
export function publicProspectApplicant(applicant){
 const source=applicant&&typeof applicant==='object'&&!Array.isArray(applicant)?applicant:{};
 const personal={...source};
 if(personal.workflowV4)personal.workflowV4={version:personal.workflowV4.version===4?4:null};
 delete personal.assignedTo;
 delete personal.leadSource;
 delete personal.additionalContacts;
 return personal;
}
