import test from "node:test";
import assert from "node:assert/strict";
import { billingProfile, professionalInvoices } from "../lib/billing.ts";
import { canSendReminder, daysFromDue, lockDueDate, openAmount, paymentSignal, receivablesSummary } from "../lib/receivables.ts";
import fs from "node:fs";

const sent=professionalInvoices.find(i=>i.id==="pinv-1");
const overdue=professionalInvoices.find(i=>i.id==="pinv-3");
test("factuur binnen betaaltermijn",()=>assert.equal(paymentSignal(sent,billingProfile),"Binnen betaaltermijn"));
test("factuur vervalt vandaag",()=>assert.equal(daysFromDue("2026-09-22"),0));
test("vervallen factuur krijgt herinneringsmogelijkheid",()=>assert.equal(canSendReminder(overdue,billingProfile),true));
test("betaalde en gecrediteerde facturen krijgen geen herinnering",()=>{assert.equal(canSendReminder(professionalInvoices.find(i=>i.status==="Betaald"),billingProfile),false);assert.equal(canSendReminder(professionalInvoices.find(i=>i.status==="Gecrediteerd"),billingProfile),false)});
test("betwisting regeling pauze en onverwerkte betaling blokkeren herinnering",()=>{for(const state of [{level:0,disputed:true},{level:0,arrangement:true},{level:0,paused:true},{level:0,pendingPayment:true}])assert.equal(canSendReminder(overdue,billingProfile,state),false)});
test("deelbetaling verlaagt het werkelijke openstaande bedrag",()=>assert.ok(openAmount(overdue,billingProfile,[{id:"p1",invoiceId:overdue.id,amount:100,paidAt:"2026-09-20",method:"bank"}])<openAmount(overdue,billingProfile)));
test("vervaldatum wordt eenmalig vanuit de gekozen termijn vastgelegd",()=>assert.equal(lockDueDate("2026-09-01",undefined,14,30),"2026-09-15"));
test("dashboardtotalen sluiten concepten en betaalde facturen uit",()=>{const s=receivablesSummary(professionalInvoices,billingProfile);assert.equal(s.count,2);assert.ok(s.total>0);assert.equal(s.overdueCount,1)});
test("algemeen dashboard bevat geen Klaas Vis-promotie",()=>{const source=fs.readFileSync(new URL("../components/portal.tsx",import.meta.url),"utf8");const dashboard=source.slice(source.indexOf("function Dashboard("),source.indexOf("function GroupOverview("));assert.equal(dashboard.includes("Klaas Vis"),false);assert.equal(dashboard.includes("insurance-dashboard"),false)});
