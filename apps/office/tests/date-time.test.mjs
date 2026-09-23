import test from 'node:test';import assert from 'node:assert/strict';import { DateTimeService } from '../src/services/date-time-service.mjs';
const service=new DateTimeService(()=>new Date('2026-03-31T22:30:00Z'));
test('datumservice gebruikt Europe/Amsterdam en actuele kalendergrenzen',()=>{assert.equal(service.date(),'2026-04-01');assert.equal(service.year(),2026);assert.equal(service.month(),4);assert.equal(service.quarter(),2);assert.equal(service.startOfYear(),'2026-01-01')});
test('ouderdom debiteuren wordt berekend en niet hardcoded',()=>{assert.equal(service.ageInDays('2026-03-15'),17);assert.equal(service.agingBucket('2026-03-15'),'1–30 dagen');assert.equal(service.agingBucket('2025-12-01'),'Meer dan 90 dagen')});
