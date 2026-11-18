import { AccessError, requireAal2, requireOrganization, requirePortalIdentity } from "@/lib/portal-access";
import { portalApi, readBody } from "@/lib/portal-api";
import { expenseCategories } from "@/lib/expense-categories";

const validCategories = new Set<string>(expenseCategories.map(item=>item[0]));
type ExpenseInput = {date:string;supplier:string;category:string;grossCents:number;vatCents:number;description?:string};

export async function GET(request:Request) {
  return portalApi(request,async ({client})=>{
    const identity=await requirePortalIdentity(client);
    requireAal2(identity);
    const url=new URL(request.url);
    const organizationId=requireOrganization(identity,url.searchParams.get("organizationId"));
    const {data:claims,error}=await client.from("bestemd_expense_claims")
      .select("id,organization_id,claimant_id,month,status,total_cents,created_at,updated_at,private_iban")
      .eq("organization_id",organizationId).eq("claimant_id",identity.profile.id)
      .order("month",{ascending:false}).order("created_at",{ascending:false}).limit(100);
    if(error)throw new AccessError(503,"Declaraties zijn tijdelijk niet beschikbaar.");
    const claimId=url.searchParams.get("claimId");
    if(!claimId)return Response.json({claims:claims??[]});
    if(!claims?.some(c=>c.id===claimId))throw new AccessError(404,"Declaratie niet gevonden.");
    const {data:lines,error:lineError}=await client.from("bestemd_expense_lines")
      .select("id,expense_date,supplier,category,gross_cents,vat_cents,description,receipt_status")
      .eq("claim_id",claimId).order("expense_date");
    if(lineError)throw new AccessError(503,"Kostenposten zijn tijdelijk niet beschikbaar.");
    return Response.json({claims,lines:lines??[]});
  });
}

export async function POST(request:Request) {
  return portalApi(request,async ({client})=>{
    const identity=await requirePortalIdentity(client);
    requireAal2(identity);
    const data=await readBody(request);
    const organizationId=requireOrganization(identity,data.organizationId);
    if(data.action==="submit") {
      if(typeof data.claimId!=="string")throw new AccessError(400,"Kies eerst een declaratie.");
      const {data:status,error}=await client.rpc("bestemd_expense_submit",{p_claim_id:data.claimId});
      if(error)throw new AccessError(400,"De declaratie kon niet worden ingediend. Controleer de kostenposten.");
      return Response.json({ok:true,status});
    }
    if(data.action!=="save")throw new AccessError(400,"Ongeldige actie.");
    const month=typeof data.month==="string"&&/^\d{4}-(0[1-9]|1[0-2])-01$/.test(data.month)?data.month:"";
    const iban=typeof data.privateIban==="string"?data.privateIban.replace(/\s/g,"").toUpperCase():"";
    if(!month || (iban&&!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)))throw new AccessError(400,"Controleer maand en privé-IBAN.");
    if(!Array.isArray(data.lines)||data.lines.length>500)throw new AccessError(400,"Ongeldig aantal kostenposten.");
    const lines:ExpenseInput[] = [];
    for(const raw of data.lines) {
      if(!raw||typeof raw!=="object")throw new AccessError(400,"Ongeldige kostenpost.");
      const row=raw as Record<string,unknown>;
      if(typeof row.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
        typeof row.supplier!=="string"||row.supplier.trim().length<2||row.supplier.length>180 ||
        typeof row.category!=="string"||!validCategories.has(row.category)||
        !Number.isSafeInteger(row.grossCents)||Number(row.grossCents)<0||
        !Number.isSafeInteger(row.vatCents)||Number(row.vatCents)<0||Number(row.vatCents)>Number(row.grossCents))
        throw new AccessError(400,"Controleer datum, leverancier, categorie en bedragen.");
      lines.push({date:row.date,supplier:row.supplier.trim(),category:row.category,grossCents:Number(row.grossCents),vatCents:Number(row.vatCents),description:typeof row.description==="string"?row.description.slice(0,1000):""});
    }
    const {data:claimId,error}=await client.rpc("bestemd_expense_save_draft",{
      p_organization_id:organizationId,p_month:month,p_private_iban:iban||null,
      p_claim_id:typeof data.claimId==="string"?data.claimId:null,p_lines:lines
    });
    if(error)throw new AccessError(400,"Concept kon niet worden opgeslagen. Controleer gegevens en rechten.");
    return Response.json({ok:true,claimId});
  });
}
