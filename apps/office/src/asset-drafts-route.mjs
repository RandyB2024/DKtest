import { checkQuery, OfficeError } from './auth/supabase.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(['owner', 'admin', 'accountant', 'handler']);
const MAX_ROWS = 100;

// Read-only; uses the Office user's RLS-scoped client. Never uses a secret key.
// The authenticated SELECT policy must be deployed separately after review.
export async function assetDraftsRoute(req, url, client, user) {
  if (url.pathname !== '/api/office/asset-drafts') return null;
  if (req.method !== 'GET') {
    throw new OfficeError(405, 'METHOD_NOT_ALLOWED', 'Alleen bekijken is toegestaan.');
  }
  if (!user?.aal2 || !ROLES.has(user.roleCode)) {
    throw new OfficeError(403, 'ASSET_DRAFTS_DENIED', 'Geen toegang tot bedrijfsmiddelenvoorstellen.');
  }
  const ids = url.searchParams.getAll('organizationId');
  if (ids.length !== 1 || !UUID.test(ids[0])) {
    throw new OfficeError(400, 'INVALID_ORGANIZATION', 'Selecteer precies één onderneming.');
  }
  const organizationId = ids[0];
  const organization = checkQuery(await client.from('organizations')
    .select('id,name').eq('id', organizationId).is('archived_at', null).maybeSingle());
  if (!organization) {
    throw new OfficeError(403, 'ORGANIZATION_DENIED', 'Geen toegang tot deze onderneming.');
  }
  const records = checkQuery(await client.from('asset_document_drafts')
    .select('queue_id,organization_id,document_id,result,approved,review_status,created_at')
    .eq('organization_id', organizationId)
    .eq('approved', false)
    .eq('review_status', 'pending_review')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS));
  const drafts = records.map(record => {
    const result = record.result && typeof record.result === 'object' && !Array.isArray(record.result)
      ? record.result : {};
    return {
      queueId: record.queue_id,
      documentId: record.document_id,
      description: typeof result.description === 'string' ? result.description.slice(0, 240) : '',
      invoiceNumber: typeof result.invoiceNumber === 'string' ? result.invoiceNumber.slice(0, 100) : '',
      invoiceDate: /^\d{4}-\d{2}-\d{2}$/.test(result.invoiceDate || '') ? result.invoiceDate : null,
      classification: result.classification === 'bedrijfsmiddel' ? 'bedrijfsmiddel' : 'onzeker',
      acquisitionCents: Number.isSafeInteger(result.acquisitionCents) ? result.acquisitionCents : null,
      vatCents: Number.isSafeInteger(result.vatCents) ? result.vatCents : null,
      totalCents: Number.isSafeInteger(result.totalCents) ? result.totalCents : null,
      amountsVerified: result.amountsVerified === true,
      createdAt: record.created_at,
      status: 'pending_review'
    };
  });
  return { status: 200, data: {
    organizationId, organizationName: organization.name, drafts,
    truncated: records.length === MAX_ROWS, readOnly: true
  } };
}
