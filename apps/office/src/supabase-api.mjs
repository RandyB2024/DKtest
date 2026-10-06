import { bankingRoute } from './banking.mjs';
import { communicationRoute } from './communication.mjs';
import {tasksRoute} from './tasks.mjs';
import {addressRoute} from './addresses.mjs';
import { passkeyAction, PasskeyError } from '../../shared/passkeys.mjs';
import { parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { writeOfficeCookie } from './auth/supabase.mjs';
import { customerMutation } from './customer-management.mjs';
import { kvkRoute } from './kvk/intake.mjs';
import { profileRoute } from './customer-profile.mjs';
import { invoicingSettingsRoute } from './invoicing-settings.mjs';
import { officeSession, officeIdentity, checkQuery, OfficeError } from './auth/supabase.mjs';

export function sendJson(res, status, data, code) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Vary: 'Cookie' });
  res.end(JSON.stringify(status >= 400 ? { ok: false, error: { code: code ?? 'UNAVAILABLE', message: data } } : { ok: true, data }));
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new OfficeError(400, 'INVALID_REQUEST', 'Ongeldig verzoek.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new OfficeError(413, 'REQUEST_TOO_LARGE', 'Verzoek te groot.'); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; }
  catch { throw new OfficeError(400, 'INVALID_REQUEST', 'Ongeldig verzoek.'); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function entity(client, table, id, fields) {
  if (!uuid.test(id ?? '')) throw new OfficeError(403, 'ENTITY_DENIED', 'Geen toegang tot deze onderneming of klantrelatie.');
  const data = checkQuery(await client.from(table).select(fields).eq('id', id).is('archived_at', null).maybeSingle());
  if (!data) throw new OfficeError(403, 'ENTITY_DENIED', 'Geen toegang tot deze onderneming of klantrelatie.');
  return data;
}
const orgFields = 'id,customer_relationship_id,name,legal_name,registration_number,archived_at';
const relationshipFields = 'id,name,status,archived_at';

const documentReadFields = [
  'id',
  'organization_id',
  'filename',
  'mime_type',
  'size_bytes',
  'source',
  'status',
  'document_type',
  'book_year',
  'book_month',
  'visible_to_customer',
  'customer_action_required',
  'acknowledgement_required',
  'processed_at',
  'created_at',
  'updated_at',
  'archived_at',
].join(',');

async function documentsReadRoute(req, url, client, readBody, user) {
  const path = url.pathname;

  const writableRoles = new Set([
    'owner',
    'admin',
    'accountant',
    'handler',
  ]);

  const requireDocumentWrite = () => {
    if (!writableRoles.has(user?.roleCode)) {
      throw new OfficeError(
        403,
        'DOCUMENT_WRITE_DENIED',
        'Uw Office-rol heeft alleen leesrechten.'
      );
    }
  };

  const validateUploadInput = input => {
    if (!input || typeof input !== 'object') {
      throw new OfficeError(
        400,
        'INVALID_UPLOAD',
        'Ongeldige upload.'
      );
    }

    const organizationId =
      input.organizationId;

    const filename =
      typeof input.filename === 'string'
        ? input.filename.trim()
        : '';

    const mimeType =
      input.mimeType;

    const sizeBytes =
      Number(input.sizeBytes);

    const documentType =
      input.documentType;

    const bookYear =
      Number(input.bookYear);

    const bookMonth =
      Number(input.bookMonth);

    const allowedMimeTypes =
      new Set([
        'application/pdf',
        'image/png',
        'image/jpeg',
      ]);

    const allowedDocumentTypes =
      new Set([
        'purchase_invoice',
        'sales_invoice',
        'bank_document',
        'tax_document',
        'payroll',
        'contract',
        'other',
      ]);

    if (
      !filename ||
      filename.length > 180 ||
      /[\u0000-\u001f\u007f]/.test(filename)
    ) {
      throw new OfficeError(
        400,
        'INVALID_FILENAME',
        'Ongeldige bestandsnaam.'
      );
    }

    if (!allowedMimeTypes.has(mimeType)) {
      throw new OfficeError(
        415,
        'INVALID_FILE_TYPE',
        'Alleen PDF, PNG en JPG zijn toegestaan.'
      );
    }

    if (
      !Number.isInteger(sizeBytes) ||
      sizeBytes <= 0 ||
      sizeBytes > 52428800
    ) {
      throw new OfficeError(
        413,
        'INVALID_FILE_SIZE',
        'Een document mag maximaal 50 MB zijn.'
      );
    }

    if (!allowedDocumentTypes.has(documentType)) {
      throw new OfficeError(
        400,
        'INVALID_DOCUMENT_TYPE',
        'Ongeldig documenttype.'
      );
    }

    if (
      !Number.isInteger(bookYear)
      || bookYear < 2000
      || bookYear > 2100
    ) {
      throw new OfficeError(
        400,
        'INVALID_BOOK_YEAR',
        'Kies een geldig boekjaar.'
      );
    }

    if (
      !Number.isInteger(bookMonth)
      || bookMonth < 1
      || bookMonth > 12
    ) {
      throw new OfficeError(
        400,
        'INVALID_BOOK_MONTH',
        'Kies een geldige maand.'
      );
    }

    return {
      organizationId,
      filename,
      mimeType,
      sizeBytes,
      documentType,
      bookYear,
      bookMonth,
      visibleToCustomer:
        input.visibleToCustomer === true,
      acknowledgementRequired:
        input.visibleToCustomer === true
        && input.acknowledgementRequired === true,
    };
  };

  if (
    req.method === 'POST'
    && path === '/api/documents/upload-ticket'
  ) {
    requireDocumentWrite();

    const input =
      validateUploadInput(
        await readBody(req)
      );

    await entity(
      client,
      'organizations',
      input.organizationId,
      orgFields
    );

    const documentId =
      crypto.randomUUID();

    const extension =
      input.mimeType === 'application/pdf'
        ? 'pdf'
        : input.mimeType === 'image/png'
          ? 'png'
          : 'jpg';

    const storagePath =
      `${input.organizationId}/inbox/${documentId}/file.${extension}`;

    const signed =
      await client.storage
        .from('documents')
        .createSignedUploadUrl(
          storagePath,
          {
            upsert: false,
          }
        );

    if (
      signed.error
      || !signed.data?.signedUrl
    ) {
      throw new OfficeError(
        503,
        'UPLOAD_TICKET_FAILED',
        'De beveiligde upload kon niet worden voorbereid.'
      );
    }

    return {
      status: 200,
      data: {
        documentId,
        storagePath,
        signedUrl:
          signed.data.signedUrl,
        token:
          signed.data.token,
      },
    };
  }

  if (
    req.method === 'POST'
    && path === '/api/documents/upload-complete'
  ) {
    requireDocumentWrite();

    const raw =
      await readBody(req);

    const input =
      validateUploadInput(raw);

    const documentId =
      raw.documentId;

    if (!uuid.test(documentId ?? '')) {
      throw new OfficeError(
        400,
        'INVALID_DOCUMENT',
        'Ongeldig document.'
      );
    }

    await entity(
      client,
      'organizations',
      input.organizationId,
      orgFields
    );

    const extension =
      input.mimeType === 'application/pdf'
        ? 'pdf'
        : input.mimeType === 'image/png'
          ? 'png'
          : 'jpg';

    const storagePath =
      `${input.organizationId}/inbox/${documentId}/file.${extension}`;

    const result =
      checkQuery(
        await client.rpc(
          'office_register_document_upload',
          {
            p_document_id:
              documentId,
            p_organization_id:
              input.organizationId,
            p_storage_path:
              storagePath,
            p_filename:
              input.filename,
            p_mime_type:
              input.mimeType,
            p_size_bytes:
              input.sizeBytes,
            p_document_type:
              input.documentType,
            p_book_year:
              input.bookYear,
            p_book_month:
              input.bookMonth,
            p_visible_to_customer:
              input.visibleToCustomer,
            p_acknowledgement_required:
              input.acknowledgementRequired,
          }
        )
      );

    return {
      status: 200,
      data: result,
    };
  }

  if (req.method === 'GET' && path === '/api/documents/inbox') {
    const documents = checkQuery(
      await client
        .from('documents')
        .select(documentReadFields)
        .eq('source', 'customer')
        .eq('status', 'new')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(100)
    );

    return {
      status: 200,
      data: {
        documents,
      },
    };
  }

  if (req.method === 'GET' && path === '/api/documents') {
    const organizationIds = url.searchParams.getAll('organizationId');

    if (organizationIds.length !== 1) {
      throw new OfficeError(
        400,
        'ORGANIZATION_REQUIRED',
        'Kies ??n onderneming.'
      );
    }

    const organizationId = organizationIds[0];

    await entity(
      client,
      'organizations',
      organizationId,
      orgFields
    );

    const documents = checkQuery(
      await client
        .from('documents')
        .select(documentReadFields)
        .eq('organization_id', organizationId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(250)
    );

    return {
      status: 200,
      data: {
        organizationId,
        documents,
      },
    };
  }

  const processDocument =
    path.match(/^\/api\/documents\/([^/]+)\/process$/);

  if (req.method === 'PATCH' && processDocument) {
    const documentId =
      decodeURIComponent(processDocument[1]);

    if (!uuid.test(documentId)) {
      throw new OfficeError(
        400,
        'INVALID_DOCUMENT',
        'Ongeldig document.'
      );
    }

    const input = await readBody(req);

    const organizationId =
      input.organizationId;

    await entity(
      client,
      'organizations',
      organizationId,
      orgFields
    );

    const allowedStatuses = new Set([
      'new',
      'in_review',
      'needs_customer_action',
      'ready',
      'processed',
    ]);

    const allowedTypes = new Set([
      'purchase_invoice',
      'sales_invoice',
      'bank_document',
      'tax_document',
      'payroll',
      'contract',
      'other',
    ]);

    if (!allowedStatuses.has(input.status)) {
      throw new OfficeError(
        400,
        'INVALID_STATUS',
        'Ongeldige documentstatus.'
      );
    }

    if (!allowedTypes.has(input.documentType)) {
      throw new OfficeError(
        400,
        'INVALID_DOCUMENT_TYPE',
        'Ongeldig documenttype.'
      );
    }

    const bookYear =
      input.bookYear === null ||
      input.bookYear === '' ||
      input.bookYear === undefined
        ? null
        : Number(input.bookYear);

    const bookMonth =
      input.bookMonth === null ||
      input.bookMonth === '' ||
      input.bookMonth === undefined
        ? null
        : Number(input.bookMonth);

    if (
      bookYear !== null &&
      (
        !Number.isInteger(bookYear) ||
        bookYear < 2000 ||
        bookYear > 2100
      )
    ) {
      throw new OfficeError(
        400,
        'INVALID_BOOK_YEAR',
        'Ongeldig boekjaar.'
      );
    }

    if (
      bookMonth !== null &&
      (
        !Number.isInteger(bookMonth) ||
        bookMonth < 1 ||
        bookMonth > 12
      )
    ) {
      throw new OfficeError(
        400,
        'INVALID_BOOK_MONTH',
        'Ongeldige maand.'
      );
    }

    const result = checkQuery(
      await client.rpc(
        'office_process_customer_document',
        {
          p_organization_id: organizationId,
          p_document_id: documentId,
          p_status: input.status,
          p_document_type: input.documentType,
          p_book_year: bookYear,
          p_book_month: bookMonth,
        }
      )
    );

    return {
      status: 200,
      data: result,
    };
  }

  const download =
    path.match(/^\/api\/documents\/([^/]+)\/download$/);

  if (req.method === 'GET' && download) {
    const organizationIds =
      url.searchParams.getAll('organizationId');

    if (organizationIds.length !== 1) {
      throw new OfficeError(
        400,
        'ORGANIZATION_REQUIRED',
        'Kies ??n onderneming.'
      );
    }

    const organizationId =
      organizationIds[0];

    const documentId =
      decodeURIComponent(download[1]);

    if (!uuid.test(documentId)) {
      throw new OfficeError(
        400,
        'INVALID_DOCUMENT',
        'Ongeldig document.'
      );
    }

    await entity(
      client,
      'organizations',
      organizationId,
      orgFields
    );

    const document = checkQuery(
      await client
        .from('documents')
        .select('id,organization_id,storage_path,filename')
        .eq('id', documentId)
        .eq('organization_id', organizationId)
        .maybeSingle()
    );

    if (!document) {
      throw new OfficeError(
        404,
        'DOCUMENT_NOT_FOUND',
        'Document niet gevonden.'
      );
    }

    const {
      data,
      error,
    } = await client.storage
      .from('documents')
      .createSignedUrl(
        document.storage_path,
        60
      );

    if (error || !data?.signedUrl) {
      throw new OfficeError(
        503,
        'DOCUMENT_DOWNLOAD_FAILED',
        'Het document kon niet veilig worden geopend.'
      );
    }

    return {
      status: 200,
      data: {
        url: data.signedUrl,
        filename: document.filename,
      },
    };
  }

  return null;
}


export async function handleOfficeApi(req, res, config, fetchImpl) {
  try {
    const url = new URL(req.url, config.origin), path = url.pathname;
    if (!['GET','HEAD'].includes(req.method) && (req.headers.origin !== config.origin || req.headers['sec-fetch-site'] === 'cross-site')) throw new OfficeError(403, 'ORIGIN_DENIED', 'Ongeldige herkomst van het verzoek.');
    const client = officeSession(req, res, config, fetchImpl);
    if (path === '/api/auth/passkeys' && ['GET','POST'].includes(req.method)) {
      const name = 'dko-passkey-challenge';
      const data = await passkeyAction({ client, config: config.passkeys, origin: config.origin,
        input: req.method === 'GET' ? {action:'list'} : await body(req),
        identity: () => officeIdentity(client, {requireMfa:false}),
        getChallenge: () => parseCookieHeader(req.headers.cookie ?? '').find(c => c.name === name)?.value,
        setChallenge: (value,maxAge) => writeOfficeCookie(res,serializeCookieHeader(name,value,{httpOnly:true,secure:config.isProduction,sameSite:'strict',path:'/',maxAge})),
      });
      return sendJson(res,200,data);
    }
    if (path === '/api/auth/login' && req.method === 'POST') {
      const input = await body(req);
      const invalid = () => new OfficeError(401, 'LOGIN_FAILED', 'Inloggen is niet gelukt. Controleer uw gegevens of neem contact op met uw beheerder.');
      if (typeof input.email !== 'string' || typeof input.password !== 'string' || !input.email.trim() || !input.password || input.email.length > 254 || input.password.length > 1024) throw invalid();
      const result = await client.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
      if (result.error) throw invalid();
      try { await officeIdentity(client, { requireMfa: false }); }
      catch (error) { await client.auth.signOut({ scope: 'local' }); if (error.status === 503) throw error; throw invalid(); }
      return sendJson(res, 200, { redirectTo: '/dashboard' });
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new OfficeError(503, 'LOGOUT_FAILED', 'Afmelden is niet gelukt. Probeer het opnieuw.');
      // Do not Clear-Site-Data cookies: portal and Office may share localhost.
      return sendJson(res, 200, { signedOut: true });
    }
    if (path === '/api/auth/status' && req.method === 'GET') {
      try {
        const user = await officeIdentity(client, { requireMfa: false });
        return sendJson(res, 200, { authenticated: true, mfaRequired: !user.aal2, user: user.aal2 ? user : null, mode: 'supabase', developmentAuth: false });
      } catch (error) {
        if (error.status === 401) return sendJson(res, 200, { authenticated: false, user: null, mode: 'supabase', developmentAuth: false });
        throw error;
      }
    }
    if (path === '/api/auth/mfa') {
      await officeIdentity(client, { requireMfa: false });
      const { data: factors, error } = await client.auth.mfa.listFactors();
      if (error) throw new OfficeError(503, 'MFA_UNAVAILABLE', 'Tweestapsverificatie is tijdelijk niet beschikbaar.');
      if (req.method === 'GET') return sendJson(res, 200, { factors: factors.totp.map(f => ({ id: f.id, name: f.friendly_name ?? 'Authenticator' })) });
      if (req.method === 'POST') {
        const input = await body(req);
        if (input.action === 'enroll') {
          if (factors.totp.length) throw new OfficeError(409, 'FACTOR_EXISTS', 'Gebruik uw bestaande authenticator.');
          for (const f of factors.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
            const removed = await client.auth.mfa.unenroll({ factorId: f.id });
            if (removed.error) throw new OfficeError(503, 'MFA_UNAVAILABLE', 'Opnieuw instellen is niet gelukt.');
          }
          const enrolled = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Destination Known Office' });
          if (enrolled.error) throw new OfficeError(503, 'MFA_UNAVAILABLE', 'Instellen is niet gelukt.');
          return sendJson(res, 200, { factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
        }
        if (input.action !== 'verify' || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw new OfficeError(400, 'INVALID_CODE', 'Vul de zescijferige code in.');
        if (!factors.all.some(f => f.id === input.factorId && f.factor_type === 'totp')) throw new OfficeError(403, 'FACTOR_DENIED', 'Verificatie is niet gelukt.');
        const verified = await client.auth.mfa.challengeAndVerify({ factorId: input.factorId, code: input.code });
        if (verified.error) throw new OfficeError(401, 'INVALID_CODE', 'De code is onjuist of verlopen. Probeer de nieuwste code.');
        return sendJson(res, 200, { verified: true });
      }
    }
    // Everything else, including legacy and unknown API routes, passes this gate.
    const user = await officeIdentity(client);

    const banking = await bankingRoute(
      req,
      url,
      client,
      user,
      body,
      config,
      fetchImpl
    );
    if (banking) return sendJson(res, banking.status, banking.data);

    const documents = await documentsReadRoute(
      req,
      url,
      client,
      body,
      user
    );
    if (documents) return sendJson(res, documents.status, documents.data);

    const communication =
      await communicationRoute(
        req,
        url,
        client,
        user,
        body,
        config,
        fetchImpl
      );

    if (communication) {
      return sendJson(
        res,
        communication.status,
        communication.data
      );
    }


    const tasks=await tasksRoute(req,url,client,user,body);
    if(tasks)return sendJson(res,tasks.status,tasks.data);
    const address=await addressRoute(req,url,client,user,config,fetchImpl);
    if(address)return sendJson(res,address.status,address.data);
    const invoicingSettings =
      await invoicingSettingsRoute(
        req,
        url,
        client,
        user,
        body
      );

    if (invoicingSettings) {
      return sendJson(
        res,
        invoicingSettings.status,
        invoicingSettings.data
      );
    }

    const profile = await profileRoute(req,url,client,user,body);
    if (profile) return sendJson(res,profile.status,profile.data);
    const intake = await kvkRoute(req,url,client,user,config,body,fetchImpl);
    if (intake) return sendJson(res,intake.status,intake.data);
    const mutation = await customerMutation(req, url, client, user, body);
    if (mutation) return sendJson(res, mutation.status, mutation.data);
    if (!['GET','HEAD'].includes(req.method) && req.headers['content-type']?.startsWith('application/json')) {
      const input = await body(req);
      for (const name of ['organization_id','organizationId']) {
        if (input[name] !== undefined) await entity(client, 'organizations', input[name], orgFields);
      }
    }
    if (req.method === 'GET') {
      for (const name of ['organization_id', 'organizationId']) {
        for (const id of url.searchParams.getAll(name)) await entity(client, 'organizations', id, orgFields);
      }
      if (['/api/clients','/api/relationships','/api/organizations','/api/secure/summary'].includes(path)) {
        let relationships = [], organizations = [];
        // Page explicitly; never silently drop records at the PostgREST row cap.
        for (const [table, fields, result] of [['customer_relationships',relationshipFields,relationships], ['organizations',orgFields,organizations]]) {
          for (let start = 0; ; start += 500) {
            const batch = checkQuery(await client.from(table).select(fields).is('archived_at', null).order('id').range(start, start + 499));
            result.push(...batch); if (batch.length < 500) break;
          }
        }
        const filters = [...url.searchParams.getAll('organization_id'), ...url.searchParams.getAll('organizationId')];
        if (filters.length) { organizations = organizations.filter(o => filters.every(id => id === o.id)); relationships = relationships.filter(r => organizations.some(o => o.customer_relationship_id === r.id)); }
        return sendJson(res, 200, { source: 'supabase', readOnly: !user.canManageCustomers, relationships, organizations, user });
      }
      const org = path.match(/^\/api\/organizations\/([^/]+)$/);
      if (org) return sendJson(res, 200, { source: 'supabase', organization: await entity(client, 'organizations', decodeURIComponent(org[1]), orgFields) });
      const rel = path.match(/^\/api\/(?:clients|relationships)\/([^/]+)$/);
      if (rel) {
        const relationship = await entity(client, 'customer_relationships', decodeURIComponent(rel[1]), relationshipFields);
        const organizations = checkQuery(await client.from('organizations').select(orgFields).eq('customer_relationship_id', relationship.id).is('archived_at', null));
        const kvkIntakes = checkQuery(await client.from('organization_kvk_intakes').select('organization_id,kvk_number,profile,manual_details,kvk_checked_at,kvk_environment').eq('customer_relationship_id',relationship.id));
        return sendJson(res, 200, { source: 'supabase', relationship, organizations, kvkIntakes });
      }
    }
    throw new OfficeError(503, 'NOT_MIGRATED', 'Dit onderdeel is nog niet gemigreerd. Lezen, wijzigen, uploads en downloads zijn hier tijdelijk uitgeschakeld.');
  } catch (error) {
    // Never log raw SDK errors, request bodies, cookies or enrollment material.
    sendJson(res, (error instanceof OfficeError || error instanceof PasskeyError) ? error.status : 503, (error instanceof OfficeError || error instanceof PasskeyError) ? error.message : 'Office is tijdelijk niet beschikbaar. Probeer het opnieuw.', (error instanceof OfficeError || error instanceof PasskeyError) ? error.code : 'UNAVAILABLE');
  }
}
