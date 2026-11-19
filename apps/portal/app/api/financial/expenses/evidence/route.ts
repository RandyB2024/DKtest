import { AccessError, requireAal2, requireOrganization, requirePortalIdentity } from "@/lib/portal-access";
import { portalApi } from "@/lib/portal-api";

const MAX = 15 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function detectedMime(bytes: Uint8Array): "application/pdf"|"image/jpeg"|"image/png"|"image/heic"|null {
  if (bytes.length < 12) return null;
  if (bytes[0]===0x25 && bytes[1]===0x50 && bytes[2]===0x44 && bytes[3]===0x46 && bytes[4]===0x2d) return "application/pdf";
  if (bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)) return "image/png";
  const ascii=(start:number,count:number)=>String.fromCharCode(...bytes.slice(start,start+count));
  if(ascii(4,4)==="ftyp" && ["heic","heix","hevc","hevx","heim","heis","mif1"].includes(ascii(8,4))) return "image/heic";
  return null;
}
function safeName(name:string,mime:string):string {
  const ext=mime==="application/pdf"?"pdf":mime==="image/png"?"png":mime==="image/jpeg"?"jpg":"heic";
  const stem=name.replace(/\.[^.]*$/,"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9_-]/g,"-").replace(/-+/g,"-").slice(0,80)||"bon";
  return stem+"."+ext;
}
export async function POST(request:Request) {
  return portalApi(request,async ({client})=>{
    const identity=await requirePortalIdentity(client);
    requireAal2(identity);
    if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("multipart/form-data")) throw new AccessError(415,"Ongeldige upload.");
    const form=await request.formData();
    const organizationId=requireOrganization(identity,form.get("organizationId"));
    const lineId=form.get("lineId");
    const file=form.get("file");
    if(typeof lineId!=="string"||!UUID.test(lineId)||!(file instanceof File)) throw new AccessError(400,"Selecteer een geldige kostenpost en bon.");
    if(file.size<=0||file.size>MAX)throw new AccessError(413,"Maximaal 15 MB per bon.");
    const lineResult=await client.from("bestemd_expense_lines").select("claim_id,category").eq("id",lineId).maybeSingle();
    if(lineResult.error)throw new AccessError(503,"Declaratiecontrole niet beschikbaar.");
    if(!lineResult.data||lineResult.data.category==="kilometervergoeding")throw new AccessError(403,"Geen toegang tot deze kostenpost.");
    const claimResult=await client.from("bestemd_expense_claims")
      .select("id,status").eq("id",lineResult.data.claim_id)
      .eq("organization_id",organizationId).eq("claimant_id",identity.profile.id).maybeSingle();
    if(claimResult.error)throw new AccessError(503,"Declaratiecontrole niet beschikbaar.");
    if(!claimResult.data||!["draft","submitted","waiting_evidence","under_review"].includes(claimResult.data.status))
      throw new AccessError(403,"Geen toegang tot deze kostenpost.");
    const bytes=new Uint8Array(await file.arrayBuffer());
    const mime=detectedMime(bytes);
    const declared=file.type==="image/heif"?"image/heic":file.type;
    if(!mime||mime!==declared)throw new AccessError(415,"De bestandinhoud komt niet overeen met het toegestane type (PDF, JPG, PNG of HEIC).");
    const id=crypto.randomUUID();
    const filename=safeName(file.name,mime);
    const path=`${organizationId}/inbox/${id}/${filename}`;
    const upload=await client.storage.from("documents").upload(path,bytes,{contentType:mime,upsert:false,cacheControl:"3600"});
    if(upload.error)throw new AccessError(503,"De bon kon niet veilig worden opgeslagen.");
    const inserted=await client.from("documents").insert({
      id,organization_id:organizationId,storage_path:path,filename,
      mime_type:mime,size_bytes:bytes.length,source:"customer",status:"new",
      document_type:"other",visible_to_customer:true,customer_action_required:false,uploaded_by:identity.profile.id
    }).select("id").single();
    if(inserted.error||!inserted.data) {
      await client.storage.from("documents").remove([path]).catch(()=>{});
      throw new AccessError(503,"Bon opgeslagen, maar registratie is mislukt. Probeer opnieuw.");
    }
    const linked=await client.rpc("bestemd_expense_attach_document",{p_line_id:lineId,p_document_id:id});
    if(linked.error){
      // Do not delete a document on a transient RPC failure: it remains in
      // the user's secure inbox for audit and manual recovery.
      throw new AccessError(503,"Bon staat in Documenten, maar koppelen aan de declaratie is mislukt. Neem contact op met BESTEMD.");
    }
    return Response.json({ok:true,evidenceId:linked.data,documentId:id});
  });
}
