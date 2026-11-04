import test from 'node:test';
import assert from 'node:assert/strict';
import { assetDraftsRoute } from '../src/asset-drafts-route.mjs';

const orgId = '11111111-1111-4111-8111-111111111111';
const otherOrg = '22222222-2222-4222-8222-222222222222';
const url = (id=orgId) => new URL('https://example.test/api/office/asset-drafts?organizationId=' + id);
const user = { roleCode:'accountant', aal2:true };

function client(allowed=true) {
  const touched = [];
  return { touched, from(table) {
    touched.push(table);
    const row = table === 'organizations'
      ? (allowed ? { id:orgId, name:'Testorganisatie' } : null)
      : [{
          queue_id:orgId, organization_id:orgId, document_id:orgId,
          approved:false, review_status:'pending_review', created_at:'2026-11-04T06:00:00Z',
          result:{ description:'<script>alert(1)</script>', classification:'bedrijfsmiddel', acquisitionCents:150000, vatCents:31500, totalCents:181500, amountsVerified:true }
        }];
    const query = {
      select(){return query;}, eq(){return query;}, is(){return query;},
      order(){return query;}, limit(){return Promise.resolve({ data:row, error:null });},
      maybeSingle(){return Promise.resolve({ data:row, error:null });}
    };
    return query;
  } };
}

test('viewer role denied without querying records', async () => {
  const c=client();
  await assert.rejects(assetDraftsRoute({method:'GET'},url(),c,{roleCode:'viewer',aal2:true}),{status:403});
  assert.equal(c.touched.length,0);
});
test('missing MFA denied', async () => {
  await assert.rejects(assetDraftsRoute({method:'GET'},url(),client(),{roleCode:'admin',aal2:false}),{status:403});
});
test('other organization denied', async () => {
  const c=client(false);
  await assert.rejects(assetDraftsRoute({method:'GET'},url(otherOrg),c,user),{status:403});
  assert.deepEqual(c.touched,['organizations']);
});
test('returns only review draft fields for a permitted organization', async () => {
  const response=await assetDraftsRoute({method:'GET'},url(),client(),user);
  assert.equal(response.status,200);
  assert.equal(response.data.drafts[0].acquisitionCents,150000);
  assert.equal(response.data.drafts[0].status,'pending_review');
  assert.equal(response.data.drafts[0].description,'<script>alert(1)</script>');
  assert.equal('result' in response.data.drafts[0],false);
});
test('rejects invalid method and duplicate company selectors', async () => {
  await assert.rejects(assetDraftsRoute({method:'POST'},url(),client(),user),{status:405});
  await assert.rejects(assetDraftsRoute({method:'GET'},new URL(url()+'&organizationId='+orgId),client(),user),{status:400});
});
