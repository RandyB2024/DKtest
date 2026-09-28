// Synthetic contracts, not live records or recorded personal data.
export function basis(number='68750110') {
  return {kvkNummer:number,naam:'Fixture onderneming',statutaireNaam:number==='69599084'?undefined:'Fixture BV',
    formeleRegistratiedatum:'20200101',materieleRegistratie:{datumAanvang:'20200101',...(number==='96354429'?{datumEinde:'20240101'}:{})},
    handelsnamen:[{naam:'Fixture handel'},{naam:'Andere handelsnaam'}],sbiActiviteiten:[{sbiCode:'62010',sbiOmschrijving:'Testactiviteit',indHoofdactiviteit:'Ja'}],
    _embedded:{eigenaar:{rechtsvorm:number==='69599084'?'Eenmanszaak':number==='96354429'?'Coöperatie':'Besloten Vennootschap',rsin:'DO-NOT-COPY'},
      hoofdvestiging:{vestigingsnummer:'000037178598',eersteHandelsnaam:'Fixture handel',adressen:[{type:'bezoekadres',volledigAdres:'Teststraat 1, Testplaats',postcode:'1234AB',plaats:'Testplaats'},{type:'correspondentieadres',volledigAdres:'Postbus 1, Testplaats'}]},
      vestigingen:{totaalAantalVestigingen:2}}};
}
export function search(number='68750110',isActive=true){return {pagina:1,totaal:1,resultaten:[{kvkNummer:number,naam:'Fixture handel',type:'hoofdvestiging',actief:isActive?'Ja':'Nee',adres:{binnenlandsAdres:{plaats:'Testplaats'}}}]};}
export function kvkTransport(state={}){return async(input,init)=>{
  const u=new URL(input);if(u.origin!=='https://api.kvk.nl'||!u.pathname.startsWith('/test/api/'))throw new Error('No live/production traffic in tests');
  state.calls??=[];state.calls.push(u);if(init.headers.apikey!==state.key)throw new Error('Fixture API key missing');
  if(u.pathname.endsWith('/zoeken'))return Response.json(state.search??search(u.searchParams.get('kvkNummer')??'68750110'));
  const number=u.pathname.split('/').pop();if(number==='90004973')return Response.json({message:'PRIVATE UPSTREAM'}, {status:500});
  return Response.json(state.basis??basis(number));
};}
