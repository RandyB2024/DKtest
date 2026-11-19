import { OfficeError, checkQuery } from "./auth/supabase.mjs";

const financeRoles=new Set(["owner","admin","accountant"]);
const reviewers=new Set(["owner","admin","accountant","handler"]);
const validUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Office declaraties: additive API. No direct journal posting or payouts.
 * Office membership and recent MFA are checked by the parent session route.
 */
export async function officeExpenseClaimsRoute(req,url,client,user,readBody) {
  const path=url.pathname;
  const evidenceDownload=path.match(/^\/api\/expenses\/([0-9a-f-]{36})\/evidence\/([0-9a-f-]{36})\/download$/);
  if(path!=="/api/expenses"&&!/^\/api\/expenses\/[0-9a-f-]{36}(?:\/(?:approve|reject|check-evidence))?$/.test(path)&&!evidenceDownload)return null;
  if(!user?.aal2)throw new OfficeError(403,"MFA_REQUIRED","Bevestig eerst uw identiteit.");
  if(!reviewers.has(user.roleCode))throw new OfficeError(403,"EXPENSES_DENIED","Geen toegang tot declaraties.");
  if(evidenceDownload&&req.method==="GET"){
    const [,claimId,evidenceId]=evidenceDownload;
    if(!validUuid.test(claimId)||!validUuid.test(evidenceId))throw new OfficeError(400,"INVALID_EVIDENCE","Ongeldige bon.");
    const claim=checkQuery(await client.from("bestemd_expense_claims").select("id").eq("id",claimId).maybeSingle());
    if(!claim)throw new OfficeError(404,"CLAIM_NOT_FOUND","Declaratie niet gevonden.");
    const evidence=checkQuery(await client.from("bestemd_expense_evidence").select("id,line_id,storage_path").eq("id",evidenceId).maybeSingle());
    if(!evidence)throw new OfficeError(404,"EVIDENCE_NOT_FOUND","Bon niet gevonden.");
    const line=checkQuery(await client.from("bestemd_expense_lines").select("claim_id").eq("id",evidence.line_id).maybeSingle());
    if(!line||line.claim_id!==claimId)throw new OfficeError(403,"EVIDENCE_DENIED","Geen toegang tot deze bon.");
    const signed=await client.storage.from("documents").createSignedUrl(evidence.storage_path,60);
    if(signed.error||!signed.data?.signedUrl)throw new OfficeError(503,"EVIDENCE_UNAVAILABLE","Bon kan niet worden geopend.");
    return {status:200,data:{url:signed.data.signedUrl}};
  }
  if(req.method==="GET"&&path==="/api/expenses") {
    const org=url.searchParams.get("organizationId");
    const period=url.searchParams.get("month");
    const status=url.searchParams.get("status");
    let query=client.from("bestemd_expense_claims")
      .select("id,organization_id,claimant_id,month,status,total_cents,submitted_at,reviewed_at,booked_at,paid_at,created_at")
      .order("created_at",{ascending:false}).limit(200);
    if(org) {
      if(!validUuid.test(org))throw new OfficeError(400,"INVALID_ORG","Ongeldige onderneming.");
      query=query.eq("organization_id",org);
    }
    if(period){
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new OfficeError(400,"INVALID_MONTH","Ongeldige maand.");
      query=query.eq("month",period+"-01");
    }
    if(status){
      if(!new Set(["draft","submitted","waiting_evidence","under_review","approved","rejected","booking_pending","booked","paid"]).has(status))
        throw new OfficeError(400,"INVALID_STATUS","Ongeldige status.");
      query=query.eq("status",status);
    }
    const data=checkQuery(await query);
    const items=data??[];
    const orgIds=[...new Set(items.map(row=>row.organization_id))];
    const claimantIds=[...new Set(items.map(row=>row.claimant_id))];
    const organizations=orgIds.length?checkQuery(await client.from("organizations").select("id,name").in("id",orgIds)):[];
    const profiles=claimantIds.length?checkQuery(await client.from("profiles").select("id,display_name").in("id",claimantIds)):[];
    const orgNames=new Map(organizations.map(row=>[row.id,row.name]));
    const userNames=new Map(profiles.map(row=>[row.id,row.display_name]));
    return {status:200,data:{items:items.map(item=>({...item,
      organization_name:orgNames.get(item.organization_id)??"Onbekende onderneming",
      claimant_name:userNames.get(item.claimant_id)??"Onbekende declarant"
    }))}};
  }
  const match=path.match(/^\/api\/expenses\/([0-9a-f-]{36})(?:\/(approve|reject|check-evidence))?$/);
  if(!match||!validUuid.test(match[1]))throw new OfficeError(400,"INVALID_CLAIM","Ongeldige declaratie.");
  const id=match[1];
  if(req.method==="GET"&&!match[2]){
    const claim=checkQuery(await client.from("bestemd_expense_claims").select("*").eq("id",id).maybeSingle());
    if(!claim)throw new OfficeError(404,"CLAIM_NOT_FOUND","Declaratie niet gevonden.");
    const lines=checkQuery(await client.from("bestemd_expense_lines").select("*").eq("claim_id",id));
    const ids=(lines??[]).map(l=>l.id);
    const evidence=ids.length?checkQuery(await client.from("bestemd_expense_evidence").select("id,line_id,document_id,filename,mime_type,size_bytes,checked_at").in("line_id",ids)):[];
    const trips=ids.length?checkQuery(await client.from("bestemd_expense_mileage").select("*").in("line_id",ids)):[];
    const duplicates=checkQuery(await client.rpc("bestemd_expense_duplicate_candidates",{p_claim_id:id}));
    const repaymentSuggestions=checkQuery(await client.rpc("bestemd_expense_repayment_suggestions",{p_claim_id:id}));
    return {status:200,data:{claim,lines:lines??[],evidence,trips,
      duplicates:duplicates??[],repaymentSuggestions:repaymentSuggestions??[]}};
  }
  if(req.method==="POST"&&match[2]){
    const input=await readBody(req);
    if(match[2]==="check-evidence"){
      if(!reviewers.has(user.roleCode)||typeof input.evidenceId!=="string"||!validUuid.test(input.evidenceId))
        throw new OfficeError(400,"EVIDENCE_REQUIRED","Kies een geldig bewijsstuk.");
      const valid=checkQuery(await client.rpc("bestemd_expense_office_check_evidence",{p_evidence_id:input.evidenceId}));
      return {status:200,data:{checked:valid===true}};
    }
    if(!financeRoles.has(user.roleCode))throw new OfficeError(403,"FINANCE_APPROVAL_DENIED","Alleen een bevoegde financieel beoordelaar mag goedkeuren of afwijzen.");
    const decision=match[2]==="approve"?"approve":"reject";
    const reason=typeof input.reason==="string"?input.reason.slice(0,1000):"";
    const status=checkQuery(await client.rpc("bestemd_expense_office_decide",{
      p_claim_id:id,p_decision:decision,p_reason:reason
    }));
    return {status:200,data:{status}};
  }
  throw new OfficeError(405,"METHOD_DENIED","Deze handeling is niet toegestaan.");
}
