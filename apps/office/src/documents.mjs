import { randomUUID } from 'node:crypto';

import {
  OfficeError,
  checkQuery,
} from './auth/supabase.mjs';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const allowedMimeTypes =
  new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
  ]);

const maxFileBytes =
  50 * 1024 * 1024;

const activeStatuses =
  new Set([
    'new',
    'in_review',
    'needs_customer_action',
    'ready',
    'processed',
  ]);

const documentFields = [
  'id',
  'organization_id',
  'folder_id',
  'storage_path',
  'filename',
  'mime_type',
  'size_bytes',
  'source',
  'status',
  'document_type',
  'book_year',
  'book_month',
  'archive_folder_name',
  'visible_to_customer',
  'customer_action_required',
  'acknowledgement_required',
  'notes',
  'processed_at',
  'created_at',
  'updated_at',
  'archived_at',
].join(',');

function safeFilename(value) {
  const cleaned =
    String(value ?? '')
      .normalize('NFKC')
      .replace(
        /[^\p{L}\p{N}._ -]+/gu,
        '-',
      )
      .replace(
        /\s+/g,
        ' ',
      )
      .trim()
      .slice(
        0,
        180,
      );

  return cleaned ||
    'document';
}

async function requireOrganization(
  client,
  organizationId,
) {
  if (
    !uuid.test(
      organizationId ?? '',
    )
  ) {
    throw new OfficeError(
      403,
      'ENTITY_DENIED',
      'Geen toegang tot deze onderneming.',
    );
  }

  const organization =
    checkQuery(
      await client
        .from(
          'organizations',
        )
        .select(
          'id,name,legal_name,customer_relationship_id,archived_at',
        )
        .eq(
          'id',
          organizationId,
        )
        .is(
          'archived_at',
          null,
        )
        .maybeSingle(),
    );

  if (
    !organization
  ) {
    throw new OfficeError(
      403,
      'ENTITY_DENIED',
      'Geen toegang tot deze onderneming.',
    );
  }

  return organization;
}

async function readMultipart(
  req,
  config,
) {
  const contentType =
    req.headers[
      'content-type'
    ] ?? '';

  if (
    !contentType.startsWith(
      'multipart/form-data',
    )
  ) {
    throw new OfficeError(
      415,
      'INVALID_CONTENT_TYPE',
      'Upload het bestand als formulierupload.',
    );
  }

  const contentLength =
    Number(
      req.headers[
        'content-length'
      ] ?? 0,
    );

  if (
    Number.isFinite(
      contentLength,
    ) &&
    contentLength >
      maxFileBytes +
        1024 * 1024
  ) {
    throw new OfficeError(
      413,
      'FILE_TOO_LARGE',
      'Het bestand mag maximaal 50 MB groot zijn.',
    );
  }

  const headers =
    new Headers();

  for (
    const [
      name,
      value,
    ]
    of Object.entries(
      req.headers,
    )
  ) {
    if (
      Array.isArray(
        value,
      )
    ) {
      for (
        const item
        of value
      ) {
        headers.append(
          name,
          item,
        );
      }
    } else if (
      typeof value ===
      'string'
    ) {
      headers.set(
        name,
        value,
      );
    }
  }

  let request;

  try {
    request =
      new Request(
        new URL(
          req.url,
          config.origin,
        ),
        {
          method:
            req.method,
          headers,
          body:
            req,
          duplex:
            'half',
        },
      );
  } catch {
    throw new OfficeError(
      400,
      'INVALID_UPLOAD',
      'De upload kon niet worden gelezen.',
    );
  }

  try {
    return await request.formData();
  } catch {
    throw new OfficeError(
      400,
      'INVALID_UPLOAD',
      'De upload kon niet worden gelezen.',
    );
  }
}

function receiptSummary(
  rows,
) {
  const result =
    new Map();

  for (
    const row
    of rows ?? []
  ) {
    const current =
      result.get(
        row.document_id,
      ) ?? {
        openedCount:
          0,
        acknowledgedCount:
          0,
        lastOpenedAt:
          null,
        lastAcknowledgedAt:
          null,
      };

    if (
      row.opened_at
    ) {
      current.openedCount +=
        1;

      if (
        !current.lastOpenedAt ||
        row.opened_at >
          current.lastOpenedAt
      ) {
        current.lastOpenedAt =
          row.opened_at;
      }
    }

    if (
      row.acknowledged_at
    ) {
      current.acknowledgedCount +=
        1;

      if (
        !current.lastAcknowledgedAt ||
        row.acknowledged_at >
          current.lastAcknowledgedAt
      ) {
        current.lastAcknowledgedAt =
          row.acknowledged_at;
      }
    }

    result.set(
      row.document_id,
      current,
    );
  }

  return result;
}

async function listDocuments(
  client,
  organizationId,
) {
  await requireOrganization(
    client,
    organizationId,
  );

  const documents =
    checkQuery(
      await client
        .from(
          'documents',
        )
        .select(
          documentFields,
        )
        .eq(
          'organization_id',
          organizationId,
        )
        .is(
          'archived_at',
          null,
        )
        .order(
          'created_at',
          {
            ascending:
              false,
          },
        ),
    );

  const ids =
    documents.map(
      document =>
        document.id,
    );

  let receipts =
    [];

  if (
    ids.length
  ) {
    receipts =
      checkQuery(
        await client
          .from(
            'document_receipts',
          )
          .select(
            'document_id,user_id,opened_at,acknowledged_at',
          )
          .in(
            'document_id',
            ids,
          ),
      );
  }

  const byDocument =
    receiptSummary(
      receipts,
    );

  return {
    documents:
      documents.map(
        document => ({
          ...document,
          receipt:
            byDocument.get(
              document.id,
            ) ?? {
              openedCount:
                0,
              acknowledgedCount:
                0,
              lastOpenedAt:
                null,
              lastAcknowledgedAt:
                null,
            },
        }),
      ),
  };
}

async function uploadDocument(
  req,
  client,
  user,
  config,
) {
  const form =
    await readMultipart(
      req,
      config,
    );

  const organizationId =
    String(
      form.get(
        'organizationId',
      ) ?? '',
    );

  await requireOrganization(
    client,
    organizationId,
  );

  const file =
    form.get(
      'file',
    );

  if (
    !(file instanceof File)
  ) {
    throw new OfficeError(
      400,
      'FILE_REQUIRED',
      'Kies een document om te uploaden.',
    );
  }

  if (
    file.size <= 0
  ) {
    throw new OfficeError(
      400,
      'EMPTY_FILE',
      'Het bestand is leeg.',
    );
  }

  if (
    file.size >
      maxFileBytes
  ) {
    throw new OfficeError(
      413,
      'FILE_TOO_LARGE',
      'Het bestand mag maximaal 50 MB groot zijn.',
    );
  }

  if (
    !allowedMimeTypes.has(
      file.type,
    )
  ) {
    throw new OfficeError(
      415,
      'FILE_TYPE_DENIED',
      'Alleen PDF-, JPG- en PNG-bestanden zijn toegestaan.',
    );
  }

  const acknowledgementRequired =
    String(
      form.get(
        'acknowledgementRequired',
      ) ?? '',
    ) ===
    'true';

  const id =
    randomUUID();

  const filename =
    safeFilename(
      file.name,
    );

  const storagePath =
    `${organizationId}/inbox/${id}/${filename}`;

  const bytes =
    new Uint8Array(
      await file.arrayBuffer(),
    );

  const {
    error:
      storageError,
  } =
    await client.storage
      .from(
        'documents',
      )
      .upload(
        storagePath,
        bytes,
        {
          contentType:
            file.type,
          upsert:
            false,
        },
      );

  if (
    storageError
  ) {
    throw new OfficeError(
      503,
      'DOCUMENT_UPLOAD_FAILED',
      'Het document kon niet veilig worden opgeslagen.',
    );
  }

  const {
    data:
      inserted,
    error:
      insertError,
  } =
    await client
      .from(
        'documents',
      )
      .insert({
        id,
        organization_id:
          organizationId,
        storage_path:
          storagePath,
        filename:
          file.name,
        mime_type:
          file.type,
        size_bytes:
          file.size,
        source:
          'office',
        status:
          'new',
        document_type:
          'other',
        visible_to_customer:
          true,
        customer_action_required:
          false,
        acknowledgement_required:
          acknowledgementRequired,
        uploaded_by:
          user.id,
      })
      .select(
        documentFields,
      )
      .single();

  if (
    insertError ||
    !inserted
  ) {
    throw new OfficeError(
      503,
      'DOCUMENT_METADATA_FAILED',
      'Het bestand is opgeslagen, maar kon niet aan het klantdossier worden gekoppeld.',
    );
  }

  const {
    error:
      eventError,
  } =
    await client
      .from(
        'document_events',
      )
      .insert({
        organization_id:
          organizationId,
        document_id:
          id,
        event_type:
          'uploaded',
        new_value: {
          source:
            'office',
          visibleToCustomer:
            true,
          acknowledgementRequired,
        },
        created_by:
          user.id,
      });

  if (
    eventError
  ) {
    // Upload blijft geldig. Het ontbrekende event mag de gebruiker
    // niet aanzetten tot een dubbele upload.
  }

  return {
    document:
      inserted,
  };
}

async function findDocument(
  client,
  organizationId,
  documentId,
) {
  if (
    !uuid.test(
      documentId ??
        '',
    )
  ) {
    throw new OfficeError(
      400,
      'INVALID_DOCUMENT',
      'Ongeldig document.',
    );
  }

  await requireOrganization(
    client,
    organizationId,
  );

  const document =
    checkQuery(
      await client
        .from(
          'documents',
        )
        .select(
          documentFields,
        )
        .eq(
          'id',
          documentId,
        )
        .eq(
          'organization_id',
          organizationId,
        )
        .maybeSingle(),
    );

  if (
    !document
  ) {
    throw new OfficeError(
      404,
      'DOCUMENT_NOT_FOUND',
      'Document niet gevonden.',
    );
  }

  return document;
}

async function downloadDocument(
  client,
  organizationId,
  documentId,
) {
  const document =
    await findDocument(
      client,
      organizationId,
      documentId,
    );

  const {
    data,
    error,
  } =
    await client.storage
      .from(
        'documents',
      )
      .createSignedUrl(
        document.storage_path,
        60,
      );

  if (
    error ||
    !data?.signedUrl
  ) {
    throw new OfficeError(
      503,
      'DOCUMENT_DOWNLOAD_FAILED',
      'Het document kon niet worden geopend.',
    );
  }

  return {
    url:
      data.signedUrl,
    filename:
      document.filename,
  };
}

async function updateDocument(
  client,
  user,
  organizationId,
  documentId,
  input,
) {
  const document =
    await findDocument(
      client,
      organizationId,
      documentId,
    );

  const patch =
    {};

  if (
    input.status !==
    undefined
  ) {
    if (
      !activeStatuses.has(
        input.status,
      )
    ) {
      throw new OfficeError(
        422,
        'INVALID_STATUS',
        'Deze documentstatus is niet toegestaan.',
      );
    }

    patch.status =
      input.status;

    if (
      input.status ===
      'processed'
    ) {
      patch.processed_at =
        new Date()
          .toISOString();
    } else if (
      document.status ===
      'processed'
    ) {
      patch.processed_at =
        null;
    }
  }

  if (
    input.acknowledgementRequired !==
    undefined
  ) {
    if (
      document.source !==
      'office'
    ) {
      throw new OfficeError(
        422,
        'ACKNOWLEDGEMENT_NOT_APPLICABLE',
        'Leesbevestiging geldt alleen voor documenten van Office aan de klant.',
      );
    }

    patch.acknowledgement_required =
      input.acknowledgementRequired ===
      true;
  }

  if (
    !Object.keys(
      patch,
    ).length
  ) {
    throw new OfficeError(
      400,
      'NO_CHANGES',
      'Er zijn geen wijzigingen opgegeven.',
    );
  }

  const {
    data:
      updated,
    error,
  } =
    await client
      .from(
        'documents',
      )
      .update(
        patch,
      )
      .eq(
        'id',
        documentId,
      )
      .eq(
        'organization_id',
        organizationId,
      )
      .select(
        documentFields,
      )
      .single();

  if (
    error ||
    !updated
  ) {
    throw new OfficeError(
      503,
      'DOCUMENT_UPDATE_FAILED',
      'De documentstatus kon niet worden bijgewerkt.',
    );
  }

  await client
    .from(
      'document_events',
    )
    .insert({
      organization_id:
        organizationId,
      document_id:
        documentId,
      event_type:
        input.status !==
        undefined
          ? 'status_changed'
          : 'visibility_changed',
      old_value: {
        status:
          document.status,
        acknowledgementRequired:
          document.acknowledgement_required,
      },
      new_value: {
        status:
          updated.status,
        acknowledgementRequired:
          updated.acknowledgement_required,
      },
      created_by:
        user.id,
    });

  return {
    document:
      updated,
  };
}

export async function documentsRoute(
  req,
  url,
  client,
  user,
  config,
  body,
) {
  const path =
    url.pathname;

  if (
    path ===
      '/api/documents' &&
    req.method ===
      'GET'
  ) {
    const organizationId =
      url.searchParams.get(
        'organizationId',
      );

    return {
      status:
        200,
      data:
        await listDocuments(
          client,
          organizationId,
        ),
    };
  }

  if (
    path ===
      '/api/documents' &&
    req.method ===
      'POST'
  ) {
    return {
      status:
        201,
      data:
        await uploadDocument(
          req,
          client,
          user,
          config,
        ),
    };
  }

  const download =
    path.match(
      /^\/api\/documents\/([^/]+)\/download$/,
    );

  if (
    download &&
    req.method ===
      'GET'
  ) {
    const organizationId =
      url.searchParams.get(
        'organizationId',
      );

    return {
      status:
        200,
      data:
        await downloadDocument(
          client,
          organizationId,
          decodeURIComponent(
            download[1],
          ),
        ),
    };
  }

  const detail =
    path.match(
      /^\/api\/documents\/([^/]+)$/,
    );

  if (
    detail &&
    req.method ===
      'PATCH'
  ) {
    const input =
      await body(
        req,
      );

    return {
      status:
        200,
      data:
        await updateDocument(
          client,
          user,
          input.organizationId,
          decodeURIComponent(
            detail[1],
          ),
          input,
        ),
    };
  }

  return null;
}
