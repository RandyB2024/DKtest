import crypto from 'node:crypto';
import { clients, ledgerAccounts, auditLogs } from '../domain/demo-data.mjs';
import { dateTime } from './date-time-service.mjs';

const allowedLegalForms=['Eenmanszaak','B.V.','V.O.F.','Maatschap','Stichting'];
export class ClientOnboardingService {
  create(input,user,source='manual'){
    const name=String(input.name||'').trim(),contact=String(input.contact||'').trim();
    if(name.length<2||contact.length<2)return {ok:false,error:'Bedrijfsnaam en contactpersoon zijn verplicht.'};
    if(input.email&&!/^\S+@\S+\.\S+$/.test(input.email))return {ok:false,error:'Voer een geldig e-mailadres in.'};
    const legalForm=allowedLegalForms.includes(input.legalForm)?input.legalForm:'Eenmanszaak';
    const id=`client-${crypto.randomUUID()}`;
    const client={id,name,contact,email:String(input.email||''),phone:String(input.phone||''),legalForm,kvk:String(input.kvk||''),status:'In onboarding',through:null,actions:1,missing:0,appointment:null,manager:['Randy','Ed','Gezamenlijk'].includes(input.manager)?input.manager:user,joined:dateTime.date(),startDate:input.startDate||dateTime.date(),bankAccount:String(input.bankAccount||''),taxType:input.taxType||'IB',contactFrequency:input.contactFrequency||'Per kwartaal',fiscalYear:Number(input.fiscalYear||dateTime.year()),vatPeriod:input.vatPeriod||'Kwartaal',paymentTerm:Number(input.paymentTerm||30),hourlyRate:Number(input.hourlyRate||0),invoicePrefix:input.invoicePrefix||`${dateTime.year()}-`,profile:{car:Boolean(input.car),staff:Boolean(input.staff),vat:Boolean(input.vat),kor:Boolean(input.kor),stock:Boolean(input.stock),property:Boolean(input.property),foreign:Boolean(input.foreign)},finance:{revenue:0,costs:0,vat:0,receivables:0,payables:0,bank:0},onboardingSource:source,archivedAt:null};
    clients.push(client);auditLogs.unshift({id:`a-${crypto.randomUUID()}`,clientId:id,user,at:dateTime.iso(),module:'Klanten',action:'Klant aangemaakt',object:id,oldValue:null,newValue:{name,source}});
    return {ok:true,client,ledgerAccountsCreated:ledgerAccounts.length,period:{year:dateTime.year(),month:dateTime.month(),status:'Open'}};
  }
}
