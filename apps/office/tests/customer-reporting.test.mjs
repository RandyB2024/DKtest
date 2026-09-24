import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './helpers/development-server.mjs';
import { report as accountingReport } from '../src/domain/accounting-service.mjs';
import { CustomerReportingService } from '../src/services/customer-reporting-service.mjs';

const reporting=new CustomerReportingService();
const forbidden=/ledger|grootboek|journal|journaal|memoriaal|boekingsregel|internalNotes|lines/i;

test('klantcijfers komen uit dezelfde financiële bron',()=>{
  const source=accountingReport('de-boer-advies'),publicReport=reporting.create('de-boer-advies','ytd');
  assert.equal(publicReport.figures.revenue,source.revenue);
  assert.equal(publicReport.figures.costs,Math.round(source.costs*100)/100);
  assert.equal(publicReport.figures.resultBeforeTax,Math.round((source.revenue-source.costs)*100)/100);
});

test('maand, kwartaal en year-to-date bevatten uitsluitend begrijpelijke totalen',()=>{
  for(const period of ['month','quarter','ytd']){
    const result=reporting.create('de-boer-advies',period),serialized=JSON.stringify(result);
    assert.equal(result.period.key,period);
    assert.ok(result.trend.length>=3);
    assert.doesNotMatch(serialized,forbidden);
    assert.ok(result.explanation.includes('Uw omzet bedraagt'));
  }
});

test('onvolledige administratie wordt zichtbaar als voorlopig gemarkeerd',()=>{
  const result=reporting.create('de-boer-advies','ytd');
  assert.equal(result.quality.provisional,true);
  assert.ok(result.quality.openBankTransactions>0);
  assert.match(result.quality.message,/voorlopig/i);
});

test('ongeldige rapportageperiode wordt geweigerd',()=>assert.throws(()=>reporting.create('de-boer-advies','all'),/Ongeldige rapportageperiode/));

async function runningServer(t){const server=createServer().listen(0,'127.0.0.1');t.after(()=>server.close());await new Promise(resolve=>server.once('listening',resolve));return `http://127.0.0.1:${server.address().port}`}
async function portalLogin(base,userId){const response=await fetch(`${base}/api/portal/auth/development-login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId})});return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]}}
async function officeLogin(base){const response=await fetch(`${base}/api/auth/development-login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'randy'})});return response.headers.get('set-cookie')?.split(';')[0]}

test('klant-API geeft uitsluitend rapportage van de eigen onderneming',async t=>{
  const base=await runningServer(t),login=await portalLogin(base,'user-jan');assert.equal(login.response.status,200);
  const response=await fetch(`${base}/api/portal/organizations/de-boer-advies/reports?period=ytd`,{headers:{cookie:login.cookie}});assert.equal(response.status,200);
  const payload=await response.json();assert.equal(payload.data.report.organization.id,'de-boer-advies');assert.doesNotMatch(JSON.stringify(payload),forbidden);
});

test('klantsessie geeft geen toegang tot interne Office-boekhouding',async t=>{
  const base=await runningServer(t),login=await portalLogin(base,'user-jan');
  const response=await fetch(`${base}/api/clients/de-boer-advies/accounting`,{headers:{cookie:login.cookie}});
  assert.equal(response.status,401);
});

test('organisatiegrens wordt backendmatig afgedwongen',async t=>{
  const base=await runningServer(t),login=await portalLogin(base,'user-view');assert.equal(login.response.status,200);
  const response=await fetch(`${base}/api/portal/organizations/de-boer-advies/reports`,{headers:{cookie:login.cookie}});
  assert.equal(response.status,403);const payload=await response.json();assert.equal(payload.error.code,'NO_MEMBERSHIP');
});

test('geblokkeerde portaalgebruiker kan geen sessie openen',async t=>{
  const base=await runningServer(t),login=await portalLogin(base,'user-blocked');assert.equal(login.response.status,403);
});

test('beveiligde PDF is downloadbaar maar niet publiek cachebaar',async t=>{
  const base=await runningServer(t),login=await portalLogin(base,'user-jan');
  const response=await fetch(`${base}/api/portal/organizations/de-boer-advies/reports/month.pdf`,{headers:{cookie:login.cookie}});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString(),'%PDF');
  const publicAttempt=await fetch(`${base}/private-storage/reports/de-boer-advies-month.pdf`);assert.equal(publicAttempt.status,404);
});

test('Office kan dezelfde klantrapportage controleren',async t=>{
  const base=await runningServer(t),cookie=await officeLogin(base);
  const response=await fetch(`${base}/api/organizations/de-boer-advies/customer-report?period=quarter`,{headers:{cookie}});
  assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.data.report.period.key,'quarter');
});
