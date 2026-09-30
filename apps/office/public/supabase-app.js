// Supabase Office UI. Authentication stays on the server; no tokens in JS storage.
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let currentUser = null, currentScreen = '', generation = 0, epoch = 0, statusPending = false, installPrompt;
const unavailable = 'Dit onderdeel is nog niet gemigreerd. Gegevens, wijzigingen, uploads en downloads zijn tijdelijk niet beschikbaar.';

async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(path, { method, credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(20000), headers:{ 'Content-Type':'application/json' }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw Object.assign(new Error(result.error?.message || 'Office is tijdelijk niet beschikbaar.'), { code:result.error?.code, status:response.status });
  return result.data;
}
function screen(name) {
  currentScreen = name;
  for (const id of ['login','lock','app']) $('#' + id).hidden = id !== name;
  if (name !== 'app') { currentUser = null; generation++; $('#view').replaceChildren(); }
}
function authError(message) { const target = $('#auth-error'); if (target) target.textContent = message; }
function loginScreen(message = '') {
  screen('login');
  $('#lock').replaceChildren();
  $('#login').innerHTML = `<main class="login-card"><img class="login-logo" src="/assets/logo.png" alt="Destination Known"><p class="eyebrow">Office</p><h1>Welkom terug</h1><p class="muted">Log in met uw persoonlijke Office-account.</p><form id="office-login"><label>E-mailadres<input name="email" type="email" autocomplete="username" required></label><label>Wachtwoord<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Veilig inloggen</button></form><p id="auth-error" role="alert">${escapeHtml(message)}</p></main>`;
  $('#office-login').onsubmit = async event => {
    event.preventDefault(); const form = event.target, button = form.querySelector('button'); button.disabled = true; authError('');
    try { await api('/api/auth/login', { email:form.elements.email.value, password:form.elements.password.value }); epoch++; currentScreen = ''; await refreshStatus(); }
    catch (error) { authError(error.message); }
    finally { form.elements.password.value = ''; button.disabled = false; }
  };
}
async function mfaScreen() {
  screen('lock'); $('#login').replaceChildren();
  $('#lock').innerHTML = `<main class="login-card"><p class="eyebrow">Office beveiligen</p><h1>Tweestapsverificatie</h1><div id="mfa-content">Authenticator controleren…</div><p id="auth-error" role="alert"></p><p class="micro">Authenticator kwijt? Neem contact op met uw beheerder.</p><button id="mfa-logout" class="text-button">Afmelden</button></main>`;
  $('#mfa-logout').onclick = logout;
  const activeEpoch = epoch;
  try {
    const data = await api('/api/auth/mfa');
    if (activeEpoch !== epoch || currentScreen !== 'lock') return;
    if (data.factors.length) verificationForm(data.factors);
    else {
      $('#mfa-content').innerHTML = '<p>Koppel uw authenticator-app.</p><button id="enroll" class="primary">Authenticator instellen</button>';
      $('#enroll').onclick = async event => {
        const button = event.target; button.disabled = true; authError('');
        try {
          const setup = await api('/api/auth/mfa', { action:'enroll' });
          if (activeEpoch !== epoch || currentScreen !== 'lock') return;
          verificationForm([{ id:setup.factorId, name:'Authenticator' }], setup);
        } catch (error) { authError(error.message); button.disabled = false; }
      };
    }
  } catch (error) { authError(error.message); }
}
function verificationForm(factors, setup) {
  $('#mfa-content').innerHTML = `${setup ? '<p>Scan deze QR-code. Deel de code of instelsleutel met niemand.</p><img id="qr" width="220" height="220" alt="QR-code voor uw authenticator"><details><summary>Handmatig instellen</summary><code id="totp-secret"></code></details>' : ''}<form id="verify">${factors.length > 1 ? `<label>Authenticator<select name="factor">${factors.map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('')}</select></label>` : ''}<label>Verificatiecode<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button class="primary" type="submit">Verifiëren</button></form>`;
  if (setup) { const qr = setup.qrCode; $('#qr').src = qr.startsWith('data:image/svg+xml') ? qr : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr); $('#totp-secret').textContent = setup.secret; }
  $('#verify').onsubmit = async event => {
    event.preventDefault(); const form = event.target, button = form.querySelector('button'); button.disabled = true; authError('');
    try { await api('/api/auth/mfa', { action:'verify', factorId:factors.length === 1 ? factors[0].id : form.elements.factor.value, code:form.elements.code.value }); epoch++; currentScreen = ''; $('#mfa-content').replaceChildren(); await refreshStatus(); }
    catch (error) { authError(error.message); }
    finally { form.elements.code.value = ''; button.disabled = false; }
  };
}
async function refreshStatus() {
  if (statusPending) return;
  statusPending = true; const activeEpoch = epoch;
  try {
    const state = await api('/api/auth/status');
    if (activeEpoch !== epoch) return;
    if (!state.authenticated) { if (currentScreen !== 'login') loginScreen(); return; }
    if (state.mfaRequired) { if (currentScreen !== 'lock') await mfaScreen(); return; }
    const entering = currentScreen !== 'app' || currentUser?.canManageCustomers !== state.user.canManageCustomers || currentUser?.roleCode !== state.user.roleCode;
    // Permission changes override unsaved forms; never keep a privileged view.
    if(currentUser && currentUser.roleCode !== state.user.roleCode) $('#view').replaceChildren();
    screen('app'); currentUser = state.user;
    $('#login').replaceChildren(); $('#lock').replaceChildren();
    $('#avatar').textContent = currentUser.displayName.split(' ').map(part => part[0]).slice(0,2).join(''); $('#avatar').title = `${currentUser.displayName} · ${currentUser.role}`;
    if (entering) await renderRoute();
  } catch (error) { if (activeEpoch === epoch) loginScreen(error.message); }
  finally { statusPending = false; }
}
async function logout() {
  epoch++; generation++; currentUser = null; $('#view').replaceChildren();
  try { await api('/api/auth/logout', {}); currentScreen = ''; loginScreen(); }
  catch (error) { loginScreen(error.message); }
}
function header(title) {
  $('#page-title').textContent = title;
  $('#header-kicker').textContent = `Destination Known Office · ${currentUser?.displayName ?? ''}`;
  document.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.pathname === location.pathname || a.pathname === '/clients' && location.pathname.startsWith('/clients/')));
}
async function renderRoute() {
  if (!currentUser) return;
  if(!dispatchEvent(new Event('profile-before-leave',{cancelable:true}))){history.replaceState({},'',renderRoute.previousPath??'/clients');return;}
  renderRoute.previousPath=location.pathname;
  const activeGeneration = ++generation, path = location.pathname === '/' ? '/dashboard' : location.pathname;
  $('#view').className = /^\/(clients|organizations)\/[^/]+$/.test(path) ? 'dossier-shell' : '';
  $('#view').innerHTML = '<section class="panel" role="status">Gegevens veilig ophalen…</section>';
  try {
    let html, recordData;
    if (path === '/dashboard' || path === '/clients') {
      header(path === '/dashboard' ? `Welkom, ${currentUser.displayName}` : 'Klanten');
      const data = await api('/api/clients'); recordData = data;
      html = (path==='/dashboard'?'<div id="dashboard-tasks" class="profile-grid"><section id="tasks-today"></section><section id="tasks-overdue"></section></div>':'')+'<div id="client-workspace"></div>';
    } else if (/^\/clients\/[^/]+$/.test(path)) {
      const id = path.split('/').pop(), data = await api('/api/clients/' + id); recordData = data; header('Klantdossier');
      html = `<div class="profile-breadcrumb"><a data-route href="/clients">Klanten</a><span aria-hidden="true">/</span><span>Klantdossier</span></div><div id="customer-profile"></div>`;
    } else if (/^\/organizations\/[^/]+$/.test(path)) {
      const data = await api('/api/organizations/' + path.split('/').pop()); recordData = data; header('Onderneming');
      html = `<div class="profile-breadcrumb"><a data-route href="/clients">Klanten</a><span aria-hidden="true">/</span><a data-route href="/clients/${encodeURIComponent(data.organization.customer_relationship_id)}">Klantrelatie</a><span aria-hidden="true">/</span><span>Onderneming</span></div><div id="customer-profile"></div>`;
    } else if (path === '/documents') {
      header('Documenten');
      html = `
        <section class="panel">
          <p class="eyebrow">Destination Known Office</p>
          <h2>Documenten</h2>
          <p>De nieuwe documentenmodule is actief.</p>
          <p class="muted">Stap 1 ? basispagina zonder databasekoppeling.</p>
        </section>
      `;
    } else if (path === '/settings') {
      header('Instellingen');html='<section class="panel" id="passkey-settings"></section>';
    } else {
      const titles = { '/work-queue':'Werkvoorraad','/administration':'Administratie','/documents':'Documenten','/tax-returns':'Aangiften','/communication':'Communicatie','/audit':'Audittrail','/settings':'Instellingen' };
      header(titles[path] || 'Office');
      html = `<section class="panel empty"><p class="eyebrow">Fase 1 · Supabase</p><h2>Nog niet gemigreerd</h2><p>${unavailable}</p><p>Er wordt niets lokaal opgeslagen of als verzonden aangemerkt.</p></section>`;
    }
    if (activeGeneration === generation && currentUser) { $('#view').innerHTML = html;
      if(path==='/clients'||path==='/dashboard'){
        const {mountClientWorkspace}=await import('/client-workspace.js');
        if(activeGeneration===generation&&currentUser)mountClientWorkspace($('#client-workspace'),recordData,{canCreate:currentUser.canManageCustomers,onCreate:()=>customerForm('new')});
      }else customerControls(path, recordData);
      if(path==='/dashboard'){const {mountTasks}=await import('/tasks.js');if(activeGeneration===generation&&currentUser)await Promise.all([mountTasks($('#tasks-today'),api,{bucket:'today'}),mountTasks($('#tasks-overdue'),api,{bucket:'overdue'})]);}
      if(recordData?.relationship || recordData?.organization){
        const {mountCustomerProfile}=await import('/customer-profile.js');
        let rel=recordData.relationship,orgs=recordData.organizations;
        if(!rel){const parent=await api('/api/clients/'+recordData.organization.customer_relationship_id);rel=parent.relationship;orgs=[recordData.organization];}
        if(activeGeneration===generation&&currentUser)await mountCustomerProfile($('#customer-profile'),api,rel,orgs);
      }
      if(path==='/settings'){const {mountPasskeySettings}=await import('/passkeys.js');if(activeGeneration===generation&&currentUser)mountPasskeySettings($('#passkey-settings'),api);}
    }
  } catch (error) {
    if (activeGeneration !== generation) return;
    if (error.status === 401 || error.code === 'MFA_REQUIRED' || error.code === 'OFFICE_ACCESS_DENIED') { currentScreen = ''; await refreshStatus(); }
    else $('#view').innerHTML = `<section class="panel" role="alert"><h2>Niet beschikbaar</h2><p>${escapeHtml(error.message)}</p></section>`;
  }
}
function customerControls(path, data) {
  if (!data) return;
  const panel = document.createElement('section'); panel.className = 'panel customer-actions';
  const status = document.createElement('p'); status.id = 'mutation-status'; status.setAttribute('role','status');
  const actions = document.createElement('div'); actions.className = 'customer-buttons';
  const button = (label, action) => { const b=document.createElement('button'); b.type='button'; b.textContent=label; if(label.endsWith('archiveren'))b.className='customer-action-danger'; b.onclick=action; actions.append(b); };
  if (currentUser.canManageCustomers) {
    if (path === '/clients' || path === '/dashboard') button('Nieuwe klant',()=>customerForm('new'));
    if (data.relationship) {
      if(!data.organizations.length)button('Klantgegevens bewerken',()=>customerForm('relationship',data.relationship));
      button('Onderneming toevoegen',()=>customerForm('organization-new',data.relationship));
      button('Klant archiveren',()=>archiveForm('relationship',data.relationship,data.organizations.length));
    }
    if (data.organization) {
      // Editing occurs in the versioned customer profile.
      button('Onderneming archiveren',()=>archiveForm('organization',data.organization));
    }
  } else {
    const info=document.createElement('p'); info.textContent='Uw Office-rol heeft alleen leesrechten.'; panel.append(info);
  }
  const invite=document.createElement('button'); invite.type='button'; invite.disabled=true; invite.textContent='Account uitnodigen'; actions.append(invite);
  const note=document.createElement('p'); note.className='muted'; note.textContent='Accountuitnodigingen worden in een volgende beveiligde fase toegevoegd.';
  if(data.relationship || data.organization){const more=document.createElement('details'),summary=document.createElement('summary');more.className='profile-source';summary.textContent='Dossier beheren';more.append(summary,actions,note);panel.append(more,status);}else panel.append(actions,note,status); $('#view').prepend(panel);
}
function mutationDialog(title, fields, submitLabel, perform, destination) {
  const dialog=document.createElement('dialog'); dialog.className='customer-dialog';
  dialog.innerHTML=`<form><h2>${escapeHtml(title)}</h2><fieldset>${fields}</fieldset><p class="mutation-error" role="alert"></p><div class="customer-buttons"><button type="submit" class="primary">${escapeHtml(submitLabel)}</button><button type="button" data-cancel>Annuleren</button></div></form>`;
  $('#view').append(dialog); const form=dialog.querySelector('form'); let pending=false;
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
  form.onsubmit=async event=>{
    event.preventDefault(); if(pending)return; pending=true;
    const activeEpoch=epoch; const errorBox=dialog.querySelector('.mutation-error'); errorBox.textContent='';
    const input=Object.fromEntries(new FormData(form));
    form.querySelectorAll('button,fieldset').forEach(el=>el.disabled=true); form.querySelector('[type=submit]').textContent='Opslaan…';
    try {
      const result=await perform(input);
      if(activeEpoch!==epoch || !currentUser)return;
      dialog.close(); history.pushState({},'',destination(result)); await renderRoute();
      const status=$('#mutation-status'); if(status)status.textContent='Wijziging opgeslagen. De actuele gegevens zijn opnieuw opgehaald.';
    } catch(error) {
      if(activeEpoch!==epoch || !currentUser)return;
      if(error.status===401 || ['MFA_REQUIRED','OFFICE_ACCESS_DENIED'].includes(error.code)){currentScreen='';await refreshStatus();return;}
      errorBox.textContent=error.status ? error.message : 'Geen bevestiging ontvangen. Controleer de actuele gegevens voordat u opnieuw opslaat.';
    } finally {
      pending=false;form.querySelectorAll('button,fieldset').forEach(el=>el.disabled=false);form.querySelector('[type=submit]').textContent=submitLabel;
    }
  };
  dialog.showModal();
}
function customerForm(kind, record={}) {
  const field=(label,name,value='',required=false,extra='')=>`<label>${label}<input name="${name}" value="${escapeHtml(value)}" maxlength="200" ${required?'required':''} ${extra}></label>`;
  const orgFields=(prefix='',o={})=>field('Ondernemingsnaam',prefix+'name',o.name,true)+field('Officiële naam (optioneel)',prefix+'legal_name',o.legal_name)+field('KvK-nummer (optioneel)',prefix+'registration_number',o.registration_number,false,'pattern="[0-9]{8}" inputmode="numeric"');
  if(kind==='new') {
    const activeEpoch=epoch;
    import('/kvk-intake.js').then(({openKvkIntake})=>{
      if(activeEpoch!==epoch||!currentUser)return;
      openKvkIntake(api,async result=>{if(activeEpoch!==epoch||!currentUser)return;history.pushState({},'','/clients/'+encodeURIComponent(result.relationship_id));await renderRoute();});
    }).catch(()=>{const status=$('#mutation-status');if(status)status.textContent='De KvK-intake kan niet worden geladen. Probeer opnieuw.';});
  } else if(kind==='relationship') {
    const fields=field('Klantnaam','name',record.name,true)+`<label>Status<select name="status"><option value="active" ${record.status==='active'?'selected':''}>Actief</option><option value="inactive" ${record.status==='inactive'?'selected':''}>Inactief</option></select></label><p>Een inactieve klantrelatie heeft geen toegang via het klantportaal.</p>`;
    mutationDialog('Klantgegevens bewerken',fields,'Opslaan',input=>api('/api/relationships/'+encodeURIComponent(record.id),input,'PATCH'),()=>'/clients/'+encodeURIComponent(record.id));
  } else if(kind==='organization-new') {
    mutationDialog('Onderneming toevoegen',orgFields(),'Onderneming aanmaken',input=>api('/api/relationships/'+encodeURIComponent(record.id)+'/organizations',input),result=>'/organizations/'+encodeURIComponent(result.organization_id));
  } else {
    mutationDialog('Ondernemingsgegevens bewerken',orgFields('',record),'Opslaan',input=>api('/api/organizations/'+encodeURIComponent(record.id),input,'PATCH'),()=>'/organizations/'+encodeURIComponent(record.id));
  }
}
function archiveForm(kind,record,count=0) {
  const relationship=kind==='relationship';
  const explanation=relationship ? `Ook alle ${count} nog zichtbare ondernemingen onder deze klantrelatie worden gearchiveerd. Klantportaltoegang vervalt.` : 'De onderneming verdwijnt uit de standaardoverzichten en de klantportaltoegang vervalt.';
  mutationDialog('Archiveren bevestigen',`<p>Wilt u <strong>${escapeHtml(record.name)}</strong> archiveren?</p><p>${escapeHtml(explanation)}</p><p>Zakelijke records blijven bewaard. Herstellen is in deze fase niet beschikbaar.</p>`,'Ja, archiveren',()=>api('/api/'+(relationship?'relationships/':'organizations/')+encodeURIComponent(record.id)+'/archive',{}),()=>relationship?'/clients':'/clients/'+encodeURIComponent(record.customer_relationship_id));
}

function closeMenu() { $('#sidebar').classList.remove('mobile-open'); $('#nav-overlay').hidden = true; document.body.classList.remove('menu-open'); $('#menu').setAttribute('aria-expanded','false'); }
document.addEventListener('click', event => {
  const link = event.target.closest('[data-route]');
  if (link) { event.preventDefault(); closeMenu(); history.pushState({},'',link.getAttribute('href')); void renderRoute(); }
});
$('#menu').onclick = () => { const open = !$('#sidebar').classList.contains('mobile-open'); $('#sidebar').classList.toggle('mobile-open',open); $('#nav-overlay').hidden = !open; document.body.classList.toggle('menu-open',open); $('#menu').setAttribute('aria-expanded',String(open)); };
$('#nav-overlay').onclick = closeMenu;
$('#logout').onclick = logout;
// Legacy local unlock cannot be used for a Supabase session.
$('#manual-lock').textContent = 'Afmelden'; $('#manual-lock').onclick = logout;
document.querySelectorAll('nav b').forEach(node => node.remove());
addEventListener('popstate',renderRoute);
addEventListener('focus',refreshStatus);
setInterval(() => { if (document.visibilityState === 'visible') void refreshStatus(); },60000);
addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('#install').hidden = false; });
$('#install').onclick = async () => { if (installPrompt) await installPrompt.prompt(); installPrompt = null; $('#install').hidden = true; };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
void refreshStatus();
