/* BESTEMD_SIGNATURE_VISIBILITY_FIX_20261106 */
(()=>{'use strict';
const form=document.querySelector('#form'),input=document.querySelector('#signatureName'),checkbox=document.querySelector('#signatureAccepted');
if(!form||!input||!checkbox)return;
const wrap=document.createElement('div');wrap.id='bestemdDrawSignature';
wrap.innerHTML='<strong>Jouw handtekening</strong><p>Teken hieronder met je muis, vinger of stylus. Dit is je bevestiging van de aanvraag, niet de dienstverleningsovereenkomst.</p><canvas aria-label="Teken hier je handtekening"></canvas><button type="button" id="clearDrawSignature">Opnieuw tekenen</button><p id="signatureFeedback" role="status"></p>';
const anchor=input.closest('label')||input;anchor.before(wrap);
const canvas=wrap.querySelector('canvas'),ctx=canvas.getContext('2d');let drawn=false,active=false,last=null;
function resize(){const rect=canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return;const scale=window.devicePixelRatio||1;const data=drawn?canvas.toDataURL('image/png'):null;canvas.width=Math.round(rect.width*scale);canvas.height=Math.round(rect.height*scale);ctx.scale(scale,scale);ctx.lineWidth=2.5;ctx.lineCap='round';ctx.strokeStyle='#123a56';if(data){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,rect.width,rect.height);img.src=data;}}
const point=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}};
canvas.addEventListener('pointerdown',e=>{if(canvas.width<2||canvas.height<2)resize();e.preventDefault();active=true;canvas.setPointerCapture(e.pointerId);last=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(last.x+.1,last.y+.1);ctx.stroke();drawn=true;});
canvas.addEventListener('pointermove',e=>{if(!active)return;e.preventDefault();const p=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;});
for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>{active=false;last=null});
wrap.querySelector('#clearDrawSignature').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);drawn=false;wrap.querySelector('#signatureFeedback').textContent='Handtekening gewist.';};
requestAnimationFrame(resize);
// De wizard verbergt deze stap bij laden: het canvas is dan 0x0 pixels.
// Herinitialiseer de bitmap zodra het formulieronderdeel zichtbaar wordt.
if(typeof ResizeObserver!=='undefined'){
 const observer=new ResizeObserver(entries=>{
  const rect=entries[0]?.contentRect;
  if(!rect||rect.width<2||rect.height<2)return;
  const dpr=window.devicePixelRatio||1;
  if(Math.abs(canvas.width-rect.width*dpr)>2||Math.abs(canvas.height-rect.height*dpr)>2)resize();
 });
 observer.observe(canvas);
}
window.addEventListener('resize',()=>{if(canvas.getBoundingClientRect().width>=2)resize();});
// Capture before existing form submit handler. Never upload silently unless person clicks submit.
form.addEventListener('submit',async e=>{
 if(form.dataset.bestemdSignatureVerified==='1'){delete form.dataset.bestemdSignatureVerified;return;}
 e.preventDefault();e.stopImmediatePropagation();
 const note=wrap.querySelector('#signatureFeedback');
 if(!drawn){note.textContent='Teken eerst je handtekening in het kader.';canvas.focus();return;}
 if(!form.reportValidity()||!checkbox.checked){note.textContent='Vul de overige verplichte gegevens in en bevestig de verklaring.';return;}
 const token=new URLSearchParams(location.search).get('token');if(!token){note.textContent='Ongeldige aanvraaglink.';return;}
 note.textContent='Handtekening veilig opslaan…';
 try{
  const image=canvas.toDataURL('image/png').split(',')[1];
  const r=await fetch('/api/prospect',{method:'POST',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'signature',base64:image})});
  const body=await r.json();if(!r.ok||!body.ok)throw Error(body.error?.message||'Opslaan mislukt.');
  note.textContent='Handtekening opgeslagen.';form.dataset.bestemdSignatureVerified='1';form.requestSubmit();
 }catch(err){note.textContent='Handtekening kon niet worden opgeslagen: '+err.message;}
 },true);
})();
