import { bankTransactions, clients, journalEntries, purchaseInvoices, salesInvoices } from '../domain/demo-data.mjs';
import { reportForPeriod, periodCheck } from '../domain/accounting-service.mjs';

const PERIODS={month:{label:'Deze maand',start:'2026-09-01',months:1},quarter:{label:'Dit kwartaal',start:'2026-07-01',months:3},ytd:{label:'Boekjaar tot nu',start:'2026-01-01',months:9}};
const round=value=>Math.round(Number(value||0)*100)/100;

export class CustomerReportingService {
  create(organizationId,period='ytd'){
    const periodConfig=PERIODS[period];if(!periodConfig)throw Object.assign(new Error('Ongeldige rapportageperiode.'),{status:422,code:'INVALID_PERIOD'});
    const client=clients.find(item=>item.id===organizationId&&!item.archivedAt);if(!client)throw Object.assign(new Error('Rapportage niet gevonden.'),{status:404,code:'REPORT_NOT_FOUND'});
    const source=reportForPeriod(client.id,periodConfig.start,'2026-09-30'),quality=periodCheck(client.id);
    const revenue=round(source.revenue),costs=round(source.costs),resultBeforeTax=round(revenue-costs),expectedVat=round(source.vat*(period==='month'?1/9:period==='quarter'?3/9:1)),taxReserve=round(Math.max(0,resultBeforeTax)*.25);
    const openBankTransactions=bankTransactions.filter(item=>item.clientId===client.id&&item.status!=='Verwerkt').length;
    const missingDocuments=bankTransactions.filter(item=>item.clientId===client.id&&item.status==='Document ontbreekt').length;
    const provisional=!quality.ready;
    return {organization:{id:client.id,name:client.name,kvk:client.kvk},period:{key:period,label:periodConfig.label,generatedAt:new Date().toISOString()},figures:{revenue,costs,resultBeforeTax,bankBalance:source.bank,openSalesInvoices:source.receivables||salesInvoices.filter(i=>i.clientId===client.id&&i.payment==='Open').reduce((sum,i)=>sum+i.total,0),openPurchaseInvoices:source.payables||purchaseInvoices.filter(i=>i.clientId===client.id&&i.payment!=='Betaald').reduce((sum,i)=>sum+i.total,0),expectedVat,taxReserve},trend:this.trend(client.id,periodConfig.months),quality:{provisional,openBankTransactions,missingDocuments,message:provisional?`Deze cijfers zijn voorlopig: ${openBankTransactions} banktransactie(s) zijn nog niet volledig verwerkt en ${missingDocuments} document(en) ontbreken.`:'Alle transacties voor deze periode zijn verwerkt.'},explanation:`Uw omzet bedraagt ${this.euro(revenue)} in ${periodConfig.label.toLowerCase()}. Na aftrek van ${this.euro(costs)} aan geregistreerde kosten resteert een voorlopig resultaat vóór belasting van ${this.euro(resultBeforeTax)}.`};
  }
  trend(clientId,count){const labels=['jan','feb','mrt','apr','mei','jun','jul','aug','sep'],selected=labels.slice(-Math.max(3,count));return selected.map(label=>{const month=String(labels.indexOf(label)+1).padStart(2,'0'),lines=journalEntries.filter(entry=>entry.clientId===clientId&&entry.date.startsWith(`2026-${month}`)).flatMap(entry=>entry.lines);return {label,revenue:round(lines.filter(line=>['8000','8100'].includes(line.account)).reduce((sum,line)=>sum+Number(line.credit||0),0)),costs:round(lines.filter(line=>['4000','4200','4300','4400','4500','4550','4600','4700','4800','4900'].includes(line.account)).reduce((sum,line)=>sum+Number(line.debit||0),0))}})}
  euro(value){return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value)}
  publicView(reportData){return reportData}
}
