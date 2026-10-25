import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent, AuditLoggingError } from '@/lib/audit/audit';
import { authorize } from '@/lib/authorization/authorize';
import {
  validateUploadedFile,
  documentMetadataInputSchema,
  updateDocumentMetadataSchema,
  type DocumentMetadataInput,
} from './validation';

export interface DocumentRecord {
  id: string;
  ownerId: string;
  displayName: string;
  category: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  isOwner?: boolean;
  permission?: string | null;
}

export interface UploadDocumentResult {
  success: boolean;
  document?: DocumentRecord;
  error?: string;
}

export interface UpdateMetadataResult {
  success: boolean;
  document?: DocumentRecord;
  error?: string;
  notFoundOrDenied?: boolean;
  auditSequenceNumber?: string;
}

export interface SoftDeleteResult {
  success: boolean;
  deletedAt?: string;
  error?: string;
  notFoundOrDenied?: boolean;
  auditSequenceNumber?: string;
}

export interface ListDocumentsOptions {
  search?: string | null;
  category?: string | null;
  createdAfter?: string | null;
  createdBefore?: string | null;
  ownerFilter?: 'all' | 'mine' | 'shared' | null;
  limit?: number;
  offset?: number;
  clientIp?: string | null;
  userAgent?: string | null;
}

export interface DownloadDocumentResult {
  success: boolean;
  stream?: ReadableStream<Uint8Array> | Buffer;
  contentType?: string;
  contentLength?: number;
  filename?: string;
  error?: string;
}

const STORAGE_BUCKET = 'documents';

/**
 * Uploads a document with validation, random UUID storage key generation,
 * metadata persistence, and fail-closed audit trail.
 */
export async function uploadDocument(
  userId: string,
  fileBuffer: Uint8Array,
  rawFilename: string,
  rawMetadata: DocumentMetadataInput,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<UploadDocumentResult> {
  const adminClient = createAdminClient();

  // 1. Validate Non-File Metadata Input using Zod
  const metadataParsed = documentMetadataInputSchema.safeParse(rawMetadata);
  if (!metadataParsed.success) {
    const errorMsg = metadataParsed.error.issues.map((i) => i.message).join('; ');
    await logAuditEvent({
      actorId: userId,
      action: 'UPLOAD',
      result: 'FAILURE',
      metadata: { error: errorMsg, phase: 'metadata_validation' },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});
    return { success: false, error: errorMsg };
  }

  // 2. Validate File Buffer (Magic bytes, extension, size, filename)
  const validation = validateUploadedFile(fileBuffer, rawFilename);
  if (!validation.isValid || !validation.detectedMimeType) {
    await logAuditEvent({
      actorId: userId,
      action: 'UPLOAD',
      result: 'FAILURE',
      metadata: {
        error: validation.error,
        filename: validation.sanitizedFilename,
        size_bytes: fileBuffer.length,
      },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});
    return { success: false, error: validation.error || 'File validation failed' };
  }

  // 3. Generate random UUID storage object key (NEVER derived from filename or user ID)
  const storageObjectKey = crypto.randomUUID();

  // 4. Upload raw bytes to private storage bucket via server-side service role client
  const { error: storageError } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .upload(storageObjectKey, fileBuffer, {
      contentType: validation.detectedMimeType,
      upsert: false,
    });

  if (storageError) {
    await logAuditEvent({
      actorId: userId,
      action: 'UPLOAD',
      result: 'FAILURE',
      metadata: { error: 'Storage backend write failure' },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});
    return { success: false, error: 'Storage write failure' };
  }

  // 5. ATOMIC CREATION: Call single-transaction procedure that writes metadata and appends audit log
  try {
    const { data: rows, error: rpcError } = await adminClient.rpc(
      'create_document_and_audit',
      {
        p_owner_id: userId,
        p_display_name: metadataParsed.data.displayName || validation.sanitizedFilename,
        p_category: metadataParsed.data.category || 'general',
        p_content_type: validation.detectedMimeType,
        p_size_bytes: fileBuffer.length,
        p_storage_object_key: storageObjectKey,
        p_ip_address: clientIp || null,
        p_user_agent: userAgent || null,
        p_metadata: {
          client_filename: validation.sanitizedFilename,
        },
      }
    );

    if (rpcError || !rows || rows.length === 0) {
      throw new Error(`Database procedure error: ${rpcError?.message || 'Empty result'}`);
    }

    const insertedDoc = rows[0];

    return {
      success: true,
      document: {
        id: insertedDoc.id,
        ownerId: insertedDoc.owner_id,
        displayName: insertedDoc.display_name,
        category: insertedDoc.category,
        contentType: insertedDoc.content_type,
        sizeBytes: Number(insertedDoc.size_bytes),
        createdAt: insertedDoc.created_at,
        updatedAt: insertedDoc.updated_at,
        isOwner: true,
      },
    };
  } catch (err) {
    // ATOMIC COMPENSATION: If database metadata insertion or audit logging fails,
    // immediately delete the just-uploaded storage object so no orphaned file or un-audited state remains.
    await adminClient.storage
      .from(STORAGE_BUCKET)
      .remove([storageObjectKey])
      .catch(() => {});

    if (err instanceof AuditLoggingError) {
      throw err;
    }

    return {
      success: false,
      error: 'An internal error occurred while saving the document',
    };
  }
}

/**
 * Lists and searches accessible documents with in-database filtering
 * and secondary authorization verification.
 * Enforces audit logging for both allowed and denied queries without logging sensitive search terms.
 */
export async function listAccessibleDocuments(
  userId: string,
  optionsOrSearch?: string | ListDocumentsOptions | null,
  categoryParam?: string | null,
  limitParam = 50,
  offsetParam = 0,
  clientIpParam?: string | null,
  userAgentParam?: string | null,
  supabaseClient?: SupabaseClient
): Promise<DocumentRecord[]> {
  let client = supabaseClient;
  if (!client) {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        client = createAdminClient();
      } catch {
        // Fall back to server session client
      }
    }
    if (!client) {
      const { createClient } = await import('@/lib/supabase/server');
      client = await createClient();
    }
  }

  let search: string | null = null;
  let category: string | null = null;
  let createdAfter: string | null = null;
  let createdBefore: string | null = null;
  let ownerFilter: string | null = null;
  let limit = 50;
  let offset = 0;
  let clientIp: string | null = null;
  let userAgent: string | null = null;

  if (typeof optionsOrSearch === 'object' && optionsOrSearch !== null) {
    search = optionsOrSearch.search || null;
    category = optionsOrSearch.category || null;
    createdAfter = optionsOrSearch.createdAfter || null;
    createdBefore = optionsOrSearch.createdBefore || null;
    ownerFilter = optionsOrSearch.ownerFilter || null;
    limit = optionsOrSearch.limit ?? 50;
    offset = optionsOrSearch.offset ?? 0;
    clientIp = optionsOrSearch.clientIp || null;
    userAgent = optionsOrSearch.userAgent || null;
  } else {
    search = typeof optionsOrSearch === 'string' ? optionsOrSearch : null;
    category = categoryParam || null;
    limit = limitParam;
    offset = offsetParam;
    clientIp = clientIpParam || null;
    userAgent = userAgentParam || null;
  }

  // 1. Verify user profile status from database
  const { data: profile } = await client
    .from('profiles')
    .select('status')
    .eq('id', userId)
    .maybeSingle();

  if (!profile || profile.status !== 'ACTIVE') {
    // Record denied access in audit chain without leaking parameters
    await logAuditEvent({
      actorId: userId,
      action: 'READ',
      result: 'ACCESS_DENIED',
      metadata: {
        action_type: 'list_documents',
        reason: 'ACCOUNT_DISABLED',
      },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});
    return [];
  }

  // 2. In-Database Query Filtering (Enforced inside PostgreSQL before records are fetched)
  const { data, error } = await client.rpc('list_accessible_documents', {
    p_user_id: userId,
    p_search: search && search.trim() !== '' ? search.trim() : null,
    p_category: category && category.trim() !== '' ? category.trim() : null,
    p_limit: limit,
    p_offset: offset,
    p_created_after: createdAfter || null,
    p_created_before: createdBefore || null,
    p_owner_filter: ownerFilter || 'all',
  });

  if (error || !data) {
    await logAuditEvent({
      actorId: userId,
      action: 'READ',
      result: 'FAILURE',
      metadata: { action_type: 'list_documents', error: 'Query failed' },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});
    return [];
  }

  // 3. Defense in Depth: Run centralized authorize() on each returned document before serialization
  const verifiedDocs: DocumentRecord[] = [];
  for (const doc of data) {
    const auth = await authorize(userId, doc.id, 'READ');
    if (auth.allowed) {
      verifiedDocs.push({
        id: doc.id,
        ownerId: doc.owner_id,
        displayName: doc.display_name,
        category: doc.category,
        contentType: doc.content_type,
        sizeBytes: Number(doc.size_bytes),
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
        isOwner: doc.is_owner,
        permission: doc.permission,
      });
    }
  }

  // 4. Audit trail for the successful list/search access (NO raw search strings or document contents)
  await logAuditEvent({
    actorId: userId,
    action: 'READ',
    result: 'SUCCESS',
    metadata: {
      action_type: 'list_documents',
      count: verifiedDocs.length,
      has_search: Boolean(search && search.trim() !== ''),
      has_category: Boolean(category && category.trim() !== ''),
      has_date_filter: Boolean(createdAfter || createdBefore),
      has_owner_filter: Boolean(ownerFilter && ownerFilter !== 'all'),
    },
    ipAddress: clientIp,
    userAgent: userAgent,
  }).catch(() => {});

  return verifiedDocs;
}

/**
 * Retrieves document metadata for authorized users.
 * Returns null uniformly for unauthorized, soft-deleted, or nonexistent documents.
 */
export async function getDocumentMetadata(
  userId: string,
  documentId: string,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<DocumentRecord | null> {
  const adminClient = createAdminClient();

  // 1. Check Centralized Authorization
  const auth = await authorize(userId, documentId, 'READ');
  if (!auth.allowed) {
    await logAuditEvent({
      actorId: userId,
      documentId: documentId,
      action: 'READ',
      result: 'ACCESS_DENIED',
      metadata: { reason: auth.reason },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});
    return null;
  }

  // 2. Fetch Document Record (Never returning storage_object_key)
  const { data: doc, error } = await adminClient
    .from('documents')
    .select('id, owner_id, display_name, category, content_type, size_bytes, created_at, updated_at')
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !doc) {
    return null;
  }

  // 3. Record Audit Event
  await logAuditEvent({
    actorId: userId,
    documentId: doc.id,
    action: 'READ',
    result: 'SUCCESS',
    metadata: { action_type: 'get_metadata' },
    ipAddress: clientIp,
    userAgent: userAgent,
  });

  return {
    id: doc.id,
    ownerId: doc.owner_id,
    displayName: doc.display_name,
    category: doc.category,
    contentType: doc.content_type,
    sizeBytes: Number(doc.size_bytes),
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    isOwner: doc.owner_id === userId,
    permission: auth.grantPermission || null,
  };
}

/**
 * Downloads document bytes from the private bucket.
 * Enforces immediate pre-stream authorization check and fail-closed audit event.
 */
export async function downloadDocument(
  userId: string,
  documentId: string,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<DownloadDocumentResult> {
  const adminClient = createAdminClient();

  // 1. Initial Authorization Check
  const auth = await authorize(userId, documentId, 'DOWNLOAD');
  if (!auth.allowed) {
    await logAuditEvent({
      actorId: userId,
      documentId: documentId,
      action: 'DOWNLOAD',
      result: 'ACCESS_DENIED',
      metadata: { reason: auth.reason },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});
    return { success: false, error: 'Document not found or access denied' };
  }

  // 2. Fetch internal document storage key
  const { data: doc, error: fetchError } = await adminClient
    .from('documents')
    .select('id, owner_id, display_name, content_type, size_bytes, storage_object_key')
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchError || !doc) {
    return { success: false, error: 'Document not found or access denied' };
  }

  // 3. RE-CHECK AUTHORIZATION immediately before download streaming (Double Check)
  const recheck = await authorize(userId, documentId, 'DOWNLOAD');
  if (!recheck.allowed) {
    await logAuditEvent({
      actorId: userId,
      documentId: documentId,
      action: 'DOWNLOAD',
      result: 'ACCESS_DENIED',
      metadata: { reason: 'revoked_before_stream' },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});
    return { success: false, error: 'Document not found or access denied' };
  }

  // 4. MUST commit audit event BEFORE streaming bytes (Fail-Closed)
  // If audit writing fails, this throws AuditLoggingError and no bytes are sent
  await logAuditEvent({
    actorId: userId,
    documentId: doc.id,
    action: 'DOWNLOAD',
    result: 'SUCCESS',
    metadata: {
      size_bytes: doc.size_bytes,
      content_type: doc.content_type,
    },
    ipAddress: clientIp,
    userAgent: userAgent,
  });

  // 5. Download bytes from private bucket
  const { data: blob, error: storageError } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .download(doc.storage_object_key);

  if (storageError || !blob) {
    return { success: false, error: 'Failed to retrieve storage file' };
  }

  const arrayBuffer = await blob.arrayBuffer();

  return {
    success: true,
    stream: Buffer.from(arrayBuffer),
    contentType: doc.content_type,
    contentLength: Number(doc.size_bytes),
    filename: doc.display_name,
  };
}

/**
 * Updates safe document metadata (display name and category).
 * Centralized authorization check gates execution (owner or active EDIT grantee).
 * Uses atomic procedure that persists update and audit log in one transaction.
 */
export async function updateDocumentMetadata(
  userId: string,
  documentId: string,
  input: unknown,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<UpdateMetadataResult> {
  const adminClient = createAdminClient();

  // 1. Centralized Authorization Check (EDIT action: owner or active EDIT grantee)
  const auth = await authorize(userId, documentId, 'EDIT');
  if (!auth.allowed) {
    await logAuditEvent({
      actorId: userId,
      documentId,
      action: 'EDIT',
      result: 'ACCESS_DENIED',
      metadata: { reason: auth.reason },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});

    return {
      success: false,
      error: 'Document not found or access denied',
      notFoundOrDenied: true,
    };
  }

  // 2. Input Validation (Zod: safe metadata only; disallows mass-assignment)
  const parsed = updateDocumentMetadataSchema.safeParse(input);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join('; ');
    await logAuditEvent({
      actorId: userId,
      documentId,
      action: 'EDIT',
      result: 'FAILURE',
      metadata: { reason: 'INVALID_INPUT', error: errorMsg },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});

    return {
      success: false,
      error: errorMsg,
      notFoundOrDenied: false,
    };
  }

  // 3. Call Atomic Database Procedure
  try {
    const { data: rows, error: rpcError } = await adminClient.rpc(
      'update_document_metadata_and_audit',
      {
        p_actor_id: userId,
        p_document_id: documentId,
        p_display_name: parsed.data.displayName,
        p_category: parsed.data.category,
        p_ip_address: clientIp || null,
        p_user_agent: userAgent || null,
      }
    );

    if (rpcError || !rows || rows.length === 0) {
      return {
        success: false,
        error: rpcError?.message || 'Database metadata update failed',
      };
    }

    const row = rows[0];
    return {
      success: true,
      document: {
        id: row.id,
        ownerId: row.owner_id,
        displayName: row.display_name,
        category: row.category,
        contentType: row.content_type,
        sizeBytes: Number(row.size_bytes),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isOwner: auth.isOwner,
        permission: auth.grantPermission || (auth.isOwner ? 'OWNER' : null),
      },
      auditSequenceNumber: row.audit_sequence_number?.toString(),
    };
  } catch (err) {
    if (err instanceof AuditLoggingError) throw err;
    return {
      success: false,
      error: 'An internal error occurred while updating document metadata',
    };
  }
}

/**
 * Soft-deletes a document.
 * Centralized authorization check strictly requires document OWNER.
 * Uses atomic procedure that marks deleted_at and creates DELETE audit log.
 */
export async function softDeleteDocument(
  userId: string,
  documentId: string,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<SoftDeleteResult> {
  const adminClient = createAdminClient();

  // 1. Centralized Authorization Check (DELETE action: strictly owner)
  const auth = await authorize(userId, documentId, 'DELETE');
  if (!auth.allowed) {
    await logAuditEvent({
      actorId: userId,
      documentId,
      action: 'DELETE',
      result: 'ACCESS_DENIED',
      metadata: { reason: auth.reason },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});

    return {
      success: false,
      error: 'Document not found or access denied',
      notFoundOrDenied: true,
    };
  }

  // 2. Call Atomic Database Procedure
  try {
    const { data: rows, error: rpcError } = await adminClient.rpc(
      'soft_delete_document_and_audit',
      {
        p_actor_id: userId,
        p_document_id: documentId,
        p_ip_address: clientIp || null,
        p_user_agent: userAgent || null,
      }
    );

    if (rpcError || !rows || rows.length === 0) {
      return {
        success: false,
        error: rpcError?.message || 'Database soft deletion failed',
      };
    }

    const row = rows[0];
    return {
      success: true,
      deletedAt: row.deleted_at,
      auditSequenceNumber: row.audit_sequence_number?.toString(),
    };
  } catch (err) {
    if (err instanceof AuditLoggingError) throw err;
    return {
      success: false,
      error: 'An internal error occurred while soft-deleting document',
    };
  }
}

