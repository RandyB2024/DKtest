import { OfficeError } from '../auth/supabase.mjs';
export const invalid = () => new OfficeError(400,'INVALID_KVK_INPUT','Controleer het KvK-nummer en de ingevulde velden.');
export function kvkNumber(value) { if(typeof value!=='string'||!/^\d{8}$/.test(value))throw invalid();return value; }
export function kvkConfig(env) {
  const mode=env.KVK_API_MODE ?? 'test';
  const expected=mode==='test'?'https://api.kvk.nl/test/api':mode==='production'?'https://api.kvk.nl/api':null;
  if(!expected || (env.KVK_API_BASE_URL && env.KVK_API_BASE_URL!==expected))throw new OfficeError(503,'KVK_CONFIGURATION','De KvK-koppeling is nog niet geconfigureerd.');
  return {mode,base:expected,key:env.KVK_API_KEY,rpcKey:env.KVK_INTAKE_RPC_KEY};
}
export function searchInput(params) {
  const allowed=['kvkNumber','name','city','page'];
  for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw invalid();
  const number=params.get('kvkNumber'),name=params.get('name')?.trim(),city=params.get('city')?.trim();
  if(number!==null){kvkNumber(number);if(name||city)throw invalid();}
  else if(!name||name.length<2||name.length>120||/^\d+$/.test(name))throw invalid();
  if(city && (city.length>80 || /[\x00-\x1f]/.test(city)))throw invalid();
  if(name && /[\x00-\x1f]/.test(name))throw invalid();
  const page=params.get('page')??'1';if(!/^(?:[1-9]|10)$/.test(page))throw invalid();
  const query=new URLSearchParams({pagina:page,resultatenPerPagina:'10',inclusiefInactieveRegistraties:'true'});
  if(number)query.set('kvkNummer',number);else {query.set('naam',name);if(city)query.set('plaats',city);}
  return query;
}
export function createKvkClient(config,transport=fetch,timeoutMs=7000) {
  if(typeof config.key!=='string'||!config.key.trim()||/[\r\n]/.test(config.key))throw new OfficeError(503,'KVK_CONFIGURATION','De KvK-koppeling is nog niet geconfigureerd.');
  async function get(path) {
    const controller=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new OfficeError(504,'KVK_TIMEOUT','KvK reageert niet op tijd. Probeer het later opnieuw.'));},timeoutMs);});
    try {return await Promise.race([timeout,(async()=>{
      // Workers support manual redirects; never forward the key to a Location URL.
      const response=await transport(config.base+path,{method:'GET',headers:{apikey:config.key,Accept:'application/json'},redirect:'manual',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new OfficeError(response.status===404?404:503,response.status===404?'KVK_NOT_FOUND':'KVK_UNAVAILABLE',response.status===404?'Geen onderneming gevonden.':'KvK is tijdelijk niet beschikbaar. Probeer het later opnieuw.');
      const reader=response.body?.getReader();if(!reader)throw new Error();let size=0;const parts=[];
      try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000){await reader.cancel();throw new Error();}parts.push(value);}}
      finally {reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
      return JSON.parse(new TextDecoder().decode(bytes));
    })()]);}
    catch(e){if(e instanceof OfficeError)throw e;throw new OfficeError(503,'KVK_UNAVAILABLE','KvK is tijdelijk niet beschikbaar. Probeer het later opnieuw.');}
    finally{clearTimeout(timer);}
  }
  return {search:query=>get('/v2/zoeken?'+query),basis:number=>get('/v1/basisprofielen/'+kvkNumber(number)+'?geoData=false')};
}
