import test from 'node:test';
import assert from 'node:assert/strict';
import {startWorkflow,advanceWorkflow,canActivateClient,canSendOnboarding,validateCompanyCount,documentDeadline} from '../src/prospect-workflow-v4.mjs';
const actor='office-user';
const next=(w,to,evidence={})=>advanceWorkflow(w,to,{actorId:actor,evidence});
test('alleen 1, 2 of 5 ondernemingen; nooit 6',()=>{
 for(const count of [1,2,5]) assert.equal(validateCompanyCount(Array.from({length:count},(_,i)=>({position:i+1}))),true);
 assert.throws(()=>validateCompanyCount([]));
 assert.throws(()=>validateCompanyCount(Array.from({length:6},(_,i)=>({position:i+1}))));
});
test('geen voortijdige onboarding; wel na offerte en ondertekening',()=>{
 let w=startWorkflow(actor);
 for(const stage of ['introduction','financial_documents','financial_review','quote','quote_discussion','agreement']) w=next(w,stage);
 assert.throws(()=>next(w,'onboarding',{quoteAccepted:true}));
 w=next(w,'onboarding',{quoteAccepted:true,agreementFullySigned:true});
 assert.equal(canSendOnboarding(w),true);
});
test('activeren is geblokkeerd totdat alle controles zijn afgerond',()=>{
 let w=startWorkflow(actor);
 for(const stage of ['introduction','financial_documents','financial_review','quote','quote_discussion','agreement']) w=next(w,stage);
 w=next(w,'onboarding',{quoteAccepted:true,agreementFullySigned:true});
 w=next(w,'administration_setup',{onboardingSubmitted:true});
 w=next(w,'ready_for_activation',{documentsVerified:true,administrationReady:true});
 assert.equal(canActivateClient(w),false);
 assert.throws(()=>next(w,'active_client'));
 w=next(w,'active_client',{activationApproved:true});
 assert.equal(w.stage,'active_client');
});
test('afwijzing en coaching sluiten traject zonder volledige activatie',()=>{
 let w=next(startWorkflow(actor),'introduction');
 assert.equal(next(w,'rejected').stage,'rejected');
 assert.throws(()=>next(next(w,'rejected'),'quote'));
});

test('aanlevertermijn is tien werkdagen na indiening',()=>{
 assert.equal(documentDeadline('2026-11-17T12:00:00.000Z',10),'2026-12-01T12:00:00.000Z');
 assert.equal(documentDeadline('2026-11-20T12:00:00.000Z',1),'2026-11-23T12:00:00.000Z');
});
