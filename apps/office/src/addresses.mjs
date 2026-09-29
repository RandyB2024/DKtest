import {OfficeError} from './auth/supabase.mjs';
export const PDOK_BASE='https://api.pdok.nl/bzk/locatieserver/search/v3_1';
export function addressConfig(env){const base=env.PDOK_API_BASE_URL??PDOK_BASE;if(base!==PDOK_BASE)throw new OfficeError(503,'ADDRESS_CONFIGURATION','Adreszoeken is niet beschikbaar.');return {base};}
const invalid=()=>new OfficeError(400,'INVALID_ADDRESS','Controleer postcode, huisnummer en toevoeging.');
export function addressInput(params){if([...params.keys()].some(k=>!['postcode','houseNumber','addition'].includes(k)||params.getAll(k).length!==1))throw invalid();const postcode=(params.get('postcode')??'').trim().replace(/ /g,'').toUpperCase(),houseNumber=params.get('houseNumber')??'',addition=(params.get('addition')??'').trim().toUpperCase();if(!/^[1-9][0-9]{3}[A-Z]{2}$/.test(postcode)||!/^[1-9][0-9]{0,4}$/.test(houseNumber)||!/^[-A-Z0-9 ]{0,20}$/.test(addition))throw invalid();return{postcode,houseNumber,addition};}
const cache=new Map();
export function clearAddressCache(){cache.clear();}
export async function lookupAddress(input,config,transport=fetch,{timeoutMs=7000,now=Date.now}={}){
 if(config?.base!==PDOK_BASE)throw new OfficeError(503,'ADDRESS_CONFIGURATION','Adreszoeken is niet beschikbaar.');
 const key=JSON.stringify(input),cached=cache.get(key);if(cached&&cached.until>now())return cached.data;
 const url=new URL(config.base+'/free');url.searchParams.set('rows','50');url.searchParams.set('fl','postcode,huisnummer,huisletter,huisnummertoevoeging,straatnaam,woonplaatsnaam,gemeentenaam,nummeraanduiding_id');for(const fq of ['type:adres','bron:BAG','postcode:'+input.postcode,'huisnummer:'+input.houseNumber])url.searchParams.append('fq',fq);
 const controller=new AbortController();let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new OfficeError(504,'ADDRESS_TIMEOUT','Adreszoeken duurt te lang. U kunt het adres handmatig invullen.'));},Math.min(timeoutMs,7000));});
 try{return await Promise.race([timeout,(async()=>{
  const response=await transport(url.href,{redirect:'manual',signal:controller.signal,headers:{Accept:'application/json'},cache:'no-store'});if(!response.ok||response.redirected)throw Error();
  const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw Error();}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}const data=JSON.parse(new TextDecoder().decode(bytes)).response;
  if(!data||!Number.isSafeInteger(data.numFound)||data.numFound<0||!Array.isArray(data.docs)||data.docs.length>50||data.numFound>50||data.docs.length!==data.numFound)throw Error();
  const clean=(v,max=200)=>{if(v===undefined||v===null)return '';if(typeof v!=='string'||v.length>max||/[\x00-\x1f]/.test(v))throw Error();return v;};
  const results=data.docs.map(d=>{const addition=[clean(d.huisletter,10),clean(d.huisnummertoevoeging,20)].filter(Boolean).join('-');const r={country:'NL',postcode:clean(d.postcode,6),house_number:String(d.huisnummer),addition,street:clean(d.straatnaam),city:clean(d.woonplaatsnaam),municipality:clean(d.gemeentenaam),bag_id:clean(d.nummeraanduiding_id,16)};if(r.postcode!==input.postcode||r.house_number!==input.houseNumber||!r.street||!r.city||!/^\d{16}$/.test(r.bag_id))throw Error();return r;}).filter(r=>!input.addition||r.addition.replace(/[- ]/g,'').toUpperCase()===input.addition.replace(/[- ]/g,''));
  const answer={results,source:'PDOK/BAG',checkedAt:new Date(now()).toISOString()};if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{data:answer,until:now()+300000});return answer;
 })()]);}catch(e){if(e instanceof OfficeError)throw e;throw new OfficeError(503,'ADDRESS_UNAVAILABLE','Adreszoeken is tijdelijk niet beschikbaar. U kunt het adres handmatig invullen.');}finally{clearTimeout(timer);}
}
export async function addressRoute(req,url,client,user,config,transport){
 if(url.pathname!=='/api/addresses/lookup')return null;
 if(req.method!=='GET')throw invalid();if(!user.canManageCustomers)throw new OfficeError(403,'WRITE_DENIED','Uw Office-rol kan deze intake niet wijzigen.');
 const input=addressInput(url.searchParams);const{data,error}=await client.rpc('office_address_lookup_allow');if(error)throw new OfficeError(503,'ADDRESS_UNAVAILABLE','Adreszoeken is tijdelijk niet beschikbaar.');if(data!==true)throw new OfficeError(429,'ADDRESS_RATE_LIMIT','Te veel adresverzoeken. Probeer het over een minuut opnieuw.');
 return{status:200,data:await lookupAddress(input,config.address,transport)};
}
