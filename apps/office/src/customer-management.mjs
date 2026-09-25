import { OfficeError } from './auth/supabase.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = () => new OfficeError(400, 'INVALID_INPUT', 'Controleer de ingevulde velden.');
export function validateCustomerInput(input, kind, creating = false) {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw invalid();
  const allowed = kind === 'relationship' ? ['name','status', ...(creating ? ['organization'] : [])] : kind === 'organization' ? ['name','legal_name','registration_number'] : [];
  if (kind !== 'archive' && !Object.keys(input).length || creating && !Object.hasOwn(input,'name')) throw invalid();
  const result = {};
  for (const [key,value] of Object.entries(input)) {
    if (!allowed.includes(key)) throw invalid();
    if (key === 'organization') { result.organization = validateCustomerInput(value,'organization',true); continue; }
    if (value === null && ['legal_name','registration_number'].includes(key)) { result[key] = null; continue; }
    if (typeof value !== 'string') throw invalid();
    const text = value.trim();
    if ([...text].length > 200 || key === 'name' && !text || key === 'status' && !['active','inactive'].includes(text) || key === 'registration_number' && text && !/^[0-9]{8}$/.test(text)) throw invalid();
    result[key] = ['legal_name','registration_number'].includes(key) && !text ? null : text;
  }
  return result;
}
export async function customerMutation(req, url, client, user, readBody) {
  const routes = [
    ['POST', /^\/api\/relationships$/, 'office_create_relationship','relationship',true],
    ['PATCH', /^\/api\/relationships\/([^/]+)$/, 'office_update_relationship','relationship',false],
    ['POST', /^\/api\/relationships\/([^/]+)\/organizations$/, 'office_create_organization','organization',true],
    ['PATCH', /^\/api\/organizations\/([^/]+)$/, 'office_update_organization','organization',false],
    ['POST', /^\/api\/relationships\/([^/]+)\/archive$/, 'office_archive_relationship','archive',false],
    ['POST', /^\/api\/organizations\/([^/]+)\/archive$/, 'office_archive_organization','archive',false],
  ];
  for (const [method,pattern,rpc,kind,creating] of routes) {
    const match = url.pathname.match(pattern);
    if (req.method !== method || !match) continue;
    if (!user.canManageCustomers) throw new OfficeError(403,'WRITE_DENIED','Uw Office-rol heeft alleen leesrechten.');
    if (url.search) throw invalid();
    if (match[1] && !uuid.test(match[1])) throw invalid();
    const input = validateCustomerInput(await readBody(req),kind,creating);
    const {data,error} = await client.rpc(rpc,{p_input:input,...(match[1] ? {p_id:match[1]} : {})});
    if (error) {
      if (error.code === '42501') throw new OfficeError(403,'WRITE_DENIED','Geen toestemming voor deze wijziging.');
      if (['22023','22P02'].includes(error.code)) throw invalid();
      if (error.code === 'P0002') throw new OfficeError(404,'RECORD_UNAVAILABLE','De klantrelatie of onderneming is niet beschikbaar.');
      throw new OfficeError(503,'WRITE_UNAVAILABLE','Opslaan is niet gelukt. Controleer de actuele gegevens voordat u opnieuw probeert.');
    }
    return {status:creating ? 201 : 200,data};
  }
  return null;
}
