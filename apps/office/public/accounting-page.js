// BESTEMD Office: real test-ledger view, no accounting writes.
window.accountingEboekhoudenPage=async function(check=false){
 setHeader('Boekhouding','BESTEMD B.V. · e-Boekhouden testadministratie');
 loading();
 const d=await getJson('/api/accounting/eboekhouden'+(check?'?check=1':''));
 done();
 const items=Array.isArray(d.accounts)?d.accounts:[];
 const categories={asset:'Activa',liability:'Schulden',equity:'Eigen vermogen',expense:'Kosten',revenue:'Omzet'};
 const result=d.check;
 const status=d.connection_status==='testing'?'Testverbinding':(d.connection_status||'Niet verbonden');
 const view=$('#view');
 view.innerHTML=[
 '<section class="panel" style="margin-bottom:16px">',
 '<div class="panel-head"><div><p class="eyebrow">BOEKHOUDING</p><h2>Grootboek &amp; e-Boekhouden</h2><p class="muted">Tijdelijke testadministratie · alleen-lezen</p></div>',
 '<button class="primary" id="accounting-check" type="button">Controleer e-Boekhouden</button></div>',
 '<div style="display:flex;flex-wrap:wrap;gap:22px;margin:18px 0">',
 '<div><small class="muted">Verbinding</small><div><strong>'+esc(status)+'</strong></div></div>',
 '<div><small class="muted">Grootboek</small><div><strong>'+items.length+'</strong></div></div>',
 '<div><small class="muted">Gekoppeld</small><div><strong>'+items.filter(a=>a.linked).length+'</strong></div></div></div>',
 d.last_success_at?'<p class="muted">Laatste geregistreerde synchronisatie: '+esc(new Date(d.last_success_at).toLocaleString('nl-NL'))+'</p>':'<p class="muted">Nog geen automatische synchronisatie geregistreerd.</p>',
 result?'<p role="status"><strong>Live controle:</strong> '+esc(result.existing)+' identieke rekeningen, '+esc(result.review_required)+' ter beoordeling, '+esc(result.conflicts?.length??0)+' verschillen. Er is niets geschreven.</p>':'',
 '</section><section class="panel">',
 '<div class="panel-head"><div><h2>Rekeningschema</h2><p class="muted">Gekoppelde grootboekrekeningen</p></div></div>',
 '<label>Zoek rekening<input type="search" id="accounting-search" placeholder="Nummer of omschrijving" autocomplete="off"></label>',
 '<div style="overflow-x:auto"><table style="width:100%"><thead><tr><th>Nr.</th><th>Omschrijving</th><th>Categorie</th><th>Koppeling</th></tr></thead><tbody id="accounting-rows"></tbody></table></div>',
 '<p id="accounting-count" class="muted"></p></section>'
 ].join('');
 const input=$('#accounting-search'),rows=$('#accounting-rows'),counter=$('#accounting-count');
 function draw(){
  const q=input.value.trim().toLowerCase();
  const matches=items.filter(a=>(String(a.code)+' '+String(a.name)).toLowerCase().includes(q));
  rows.innerHTML=matches.map(a=>'<tr><td>'+esc(a.code)+'</td><td>'+esc(a.name)+'</td><td>'+esc(categories[a.account_type]||a.account_type)+'</td><td>'+(a.linked?'Gekoppeld':'Niet gekoppeld')+'</td></tr>').join('')||'<tr><td colspan="4">Geen rekeningen gevonden</td></tr>';
  counter.textContent=matches.length+' van '+items.length+' rekeningen';
 }
 input.addEventListener('input',draw);draw();
 $('#accounting-check').onclick=()=>window.accountingEboekhoudenPage(true);
};
