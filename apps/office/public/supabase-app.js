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
  $('#login').innerHTML = `<main class="login-card"><img class="login-logo" src="/assets/logo.png" alt="Destination Known"><p class="eyebrow">Office</p><h1>Welkom terug</h1><p class="muted">Log in met uw persoonlijke Office-account.</p><form id="office-login"><label>E-mailadres<input name="email" type="email" autocomplete="username" required></label><label>Wachtwoord<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Veilig inloggen</button></form><p id="auth-error" role="alert">${escapeHtml(message)}</p><p class="micro">Na het inloggen volgt tweestapsverificatie.</p></main>`;
  $('#office-login').onsubmit = async event => {
    event.preventDefault(); const form = event.target, button = form.querySelector('button'); button.disabled = true; authError('');
    try { await api('/api/auth/login', { email:form.elements.email.value, password:form.elements.password.value }); epoch++; currentScreen = ''; await refreshStatus(); }
    catch (error) { authError(error.message); }
    finally { form.elements.password.value = ''; button.disabled = false; }
  };
}
async function mfaScreen() {
  screen('lock'); $('#login').replaceChildren();
  $('#lock').innerHTML = `<main class="login-card"><p class="eyebrow">Office beveiligen</p><h1>Tweestapsverificatie</h1><div id="mfa-content">Authenticator controleren…</div><p id="auth-error" role="alert"></p><p class="micro">Authenticator kwijt? Neem contact op met uw beheerder. Verificatie kan niet worden overgeslagen.</p><button id="mfa-logout" class="text-button">Afmelden</button></main>`;
  $('#mfa-logout').onclick = logout;
  const activeEpoch = epoch;
  try {
    const data = await api('/api/auth/mfa');
    if (activeEpoch !== epoch || currentScreen !== 'lock') return;
    if (data.factors.length) verificationForm(data.factors);
    else {
      $('#mfa-content').innerHTML = '<p>Koppel een authenticator-app. U krijgt een QR-code om te scannen.</p><button id="enroll" class="primary">Authenticator instellen</button>';
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
  $('#mfa-content').innerHTML = `${setup ? '<p>Scan deze QR-code. Deel de code of instelsleutel met niemand.</p><img id="qr" width="220" height="220" alt="QR-code voor uw authenticator"><details><summary>Handmatig instellen</summary><code id="totp-secret"></code></details>' : '<p>Gebruik de nieuwste code uit uw authenticator-app.</p>'}<form id="verify"><label>Authenticator<select name="factor">${factors.map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('')}</select></label><label>Verificatiecode<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button class="primary" type="submit">Verifiëren</button></form>`;
  if (setup) { const qr = setup.qrCode; $('#qr').src = qr.startsWith('data:image/svg+xml') ? qr : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr); $('#totp-secret').textContent = setup.secret; }
  $('#verify').onsubmit = async event => {
    event.preventDefault(); const form = event.target, button = form.querySelector('button'); button.disabled = true; authError('');
    try { await api('/api/auth/mfa', { action:'verify', factorId:form.elements.factor.value, code:form.elements.code.value }); epoch++; currentScreen = ''; $('#mfa-content').replaceChildren(); await refreshStatus(); }
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
    const entering = currentScreen !== 'app';
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
function organizationCards(organizations) {
  return organizations.map(o => `<article class="panel"><p class="eyebrow">Onderneming · Supabase</p><h2>${escapeHtml(o.name)}</h2><p>${escapeHtml(o.legal_name || '')}</p><p>KvK: ${escapeHtml(o.registration_number || 'Niet ingevuld')}</p><a data-route href="/organizations/${encodeURIComponent(o.id)}">Onderneming openen</a></article>`).join('') || '<section class="panel"><p>Geen toegankelijke ondernemingen gevonden.</p></section>';
}
async function renderRoute() {
  if (!currentUser) return;
  const activeGeneration = ++generation, path = location.pathname === '/' ? '/dashboard' : location.pathname;
  $('#view').innerHTML = '<section class="panel" role="status">Gegevens veilig ophalen…</section>';
  try {
    let html;
    if (path === '/dashboard' || path === '/clients') {
      header(path === '/dashboard' ? `Welkom, ${currentUser.displayName}` : 'Klanten');
      const data = await api('/api/clients');
      html = `<section class="attention"><div><p class="eyebrow">Supabase · alleen-lezen</p><h2>Uw klantrelaties en ondernemingen</h2><p>Financiële cijfers en werkvoorraad zijn nog niet gemigreerd.</p></div></section><section class="metrics"><article><span>Klantrelaties</span><strong>${data.relationships.length}</strong></article><article><span>Ondernemingen</span><strong>${data.organizations.length}</strong></article></section><section class="panel"><h2>Klantrelaties</h2><div class="task-list">${data.relationships.map(r => `<a data-route href="/clients/${encodeURIComponent(r.id)}">${escapeHtml(r.name)} · ${escapeHtml(r.status)}</a>`).join('') || '<p>Geen toegankelijke klantrelaties gevonden.</p>'}</div></section><div class="content-grid">${organizationCards(data.organizations)}</div>`;
    } else if (/^\/clients\/[^/]+$/.test(path)) {
      const id = path.split('/').pop(), data = await api('/api/clients/' + id); header(data.relationship.name);
      html = `<section class="client-hero"><a data-route href="/clients">← Klanten</a><div><p class="eyebrow">Klantrelatie · Supabase</p><h2>${escapeHtml(data.relationship.name)}</h2><p>${escapeHtml(data.relationship.status)}</p></div></section><div class="content-grid">${organizationCards(data.organizations)}</div><section class="panel"><h2>Overige dossieronderdelen</h2><p>${unavailable}</p></section>`;
    } else if (/^\/organizations\/[^/]+$/.test(path)) {
      const data = await api('/api/organizations/' + path.split('/').pop()); header(data.organization.name);
      html = `<section class="panel"><p class="eyebrow">Onderneming · Supabase</p><h2>${escapeHtml(data.organization.name)}</h2><p>${escapeHtml(data.organization.legal_name || '')}</p><p>KvK: ${escapeHtml(data.organization.registration_number || 'Niet ingevuld')}</p><a data-route href="/clients/${encodeURIComponent(data.organization.customer_relationship_id)}">Klantrelatie openen</a><p>${unavailable}</p></section>`;
    } else {
      const titles = { '/work-queue':'Werkvoorraad','/administration':'Administratie','/documents':'Documenten','/tax-returns':'Aangiften','/communication':'Communicatie','/audit':'Audittrail','/settings':'Instellingen' };
      header(titles[path] || 'Office');
      html = `<section class="panel empty"><p class="eyebrow">Fase 1 · Supabase</p><h2>Nog niet gemigreerd</h2><p>${unavailable}</p><p>Er wordt niets lokaal opgeslagen of als verzonden aangemerkt.</p></section>`;
    }
    if (activeGeneration === generation && currentUser) $('#view').innerHTML = html;
  } catch (error) {
    if (activeGeneration !== generation) return;
    if (error.status === 401 || error.code === 'MFA_REQUIRED' || error.code === 'OFFICE_ACCESS_DENIED') { currentScreen = ''; await refreshStatus(); }
    else $('#view').innerHTML = `<section class="panel" role="alert"><h2>Niet beschikbaar</h2><p>${escapeHtml(error.message)}</p></section>`;
  }
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
