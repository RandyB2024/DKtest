// BESTEMD Cloudflare Office: authenticated accounting display. Supplied API is same-origin.
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={asset:'Activa',liability:'Schulden',equity:'Eigen vermogen',expense:'Kosten',revenue:'Omzet'};
export async function mountOfficeAccounting(root,api){
 let items=[];
 root.innerHTML=[
  '<section class="panel" style="margin-bottom:16px">',
  '<div class="panel-head"><div><p class="eyebrow">BOEKHOUDING</p><h2>Grootboek &amp; e-Boekhouden</h2><p class="muted">BESTEMD B.V. · tijdelijke testadministratie · alleen lezen</p></div>',
  '<button type="button" class="primary" id="eboek-check">Controleer e-Boekhouden</button></div>',
  '<div id="eboek-status" role="status">Grootboek ophalen…</div></section>',
  '<section class="panel"><div class="panel-head"><h2>Rekeningschema</h2></div>',
  '<label for="eboek-query">Zoek rekening</label>',
  '<input id="eboek-query" type="search" autocomplete="off" placeholder="Rekeningnummer of naam" style="width:100%;max-width:360px;margin:8px 0 16px">',
  '<div class="table-wrap" style="overflow-x:auto"><table style="width:100%"><thead><tr><th>Nr.</th><th>Omschrijving</th><th>Categorie</th><th>Koppeling</th></tr></thead><tbody id="eboek-rows"></tbody></table></div>',
  '<p class="muted" id="eboek-count"></p></section>'
 ].join('');
 const query=root.querySelector('#eboek-query'),rows=root.querySelector('#eboek-rows'),status=root.querySelector('#eboek-status'),checkButton=root.querySelector('#eboek-check'),count=root.querySelector('#eboek-count');
 function draw(){
  const q=query.value.trim().toLowerCase(),filtered=items.filter(a=>(a.code+' '+a.name).toLowerCase().includes(q));
  rows.innerHTML=filtered.map(a=>'<tr><td>'+e(a.code)+'</td><td>'+e(a.name)+'</td><td>'+e(names[a.account_type]||a.account_type)+'</td><td>'+(a.linked?'Gekoppeld':'Niet gekoppeld')+'</td></tr>').join('')||'<tr><td colspan="4">Geen rekeningen gevonden.</td></tr>';
  count.textContent=filtered.length+' van '+items.length+' rekeningen';
 }
 async function load(check=false){
  checkButton.disabled=true;
  status.textContent=check?'Live controle bij e-Boekhouden uitvoeren…':'Verbinding controleren…';
  try{
   const data=await api('/api/accounting/eboekhouden'+(check?'?check=1':''));
   if(!root.isConnected)return;
   items=Array.isArray(data.accounts)?data.accounts:[];
   const lines=[
    '<div style="display:flex;gap:22px;flex-wrap:wrap;margin:12px 0">',
    '<div><small class="muted">Status</small><div><strong>'+e(data.connection_status==='testing'?'Testverbinding':data.connection_status)+'</strong></div></div>',
    '<div><small class="muted">Rekeningen</small><div><strong>'+e(data.account_count)+'</strong></div></div>',
    '<div><small class="muted">Gekoppeld</small><div><strong>'+e(data.linked_count)+'</strong></div></div>',
    '</div>',
    data.last_success_at?'<p class="muted">Laatste geregistreerde synchronisatie: '+e(new Date(data.last_success_at).toLocaleString('nl-NL'))+'</p>':'<p class="muted">Automatische synchronisatie is nog niet ingeschakeld.</p>'
   ];
   if(data.check)lines.push('<p><strong>Live controle:</strong> '+e(data.check.existing)+' identiek, '+e(data.check.review_required)+' ter beoordeling, '+e(data.check.conflicts?.length??0)+' conflicten. Geen boekingen aangepast.</p>');
   status.innerHTML=lines.join('');
   draw();
  }catch(error){
   if(root.isConnected)status.textContent=error?.message||'De grootboekgegevens zijn tijdelijk niet beschikbaar.';
  }finally{if(root.isConnected)checkButton.disabled=false;}
 }
 query.addEventListener('input',draw);
 checkButton.addEventListener('click',()=>load(true));
 await load();
}
