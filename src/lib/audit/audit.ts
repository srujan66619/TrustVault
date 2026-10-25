import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  authorize,
  GLOBAL_AUDIT_DOCUMENT_ID,
} from '@/lib/authorization/authorize';
import type { AuditHistoryQuery } from './validation';

export type AuditAction =
  | 'READ'
  | 'DOWNLOAD'
  | 'EDIT'
  | 'DELETE'
  | 'GRANT'
  | 'REVOKE'
  | 'VIEW_AUDIT'
  | 'AUDIT_VIEW'
  | 'AUDIT_VERIFY'
  | 'LOGIN'
  | 'SYSTEM'
  | (string & {});

export type AuditResult =
  | 'SUCCESS'
  | 'ACCESS_DENIED'
  | 'FAILURE'
  | 'ALLOWED'
  | 'DENIED'
  | 'ERROR';

export interface AuditLogInput {
  actorId?: string | null;
  documentId?: string | null;
  action: AuditAction;
  result: AuditResult;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditRecord {
  id: string;
  sequenceNumber: number;
  actorId: string | null;
  documentId: string | null;
  action: string;
  result: string;
  timestamp: string;
  prevHash: string;
  rowHash: string;
  metadata: Record<string, unknown>;
}

export interface SafeAuditRecord {
  sequenceNumber: number;
  actorId: string | null;
  documentId: string | null;
  action: string;
  result: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface RawAuditHistoryRow {
  sequence_number: number | string;
  actor_id: string | null;
  document_id: string | null;
  action: string;
  result: string;
  timestamp: string;
  safe_metadata?: Record<string, unknown> | null;
}

export interface AdminChainSummary {
  isValid: boolean;
  totalVerified: number;
  failedAtSequence: number | null;
  failureReason: string | null;
  lastVerifiedAt: string;
}

export interface GetAuditHistoryResult {
  success: boolean;
  activities?: SafeAuditRecord[];
  error?: string;
  notFoundOrDenied?: boolean;
  forbidden?: boolean;
}

export interface GetAdminChainSummaryResult {
  success: boolean;
  summary?: AdminChainSummary;
  error?: string;
  forbidden?: boolean;
}

export interface AuditVerificationReport {
  isValid: boolean;
  totalVerified: number;
  failedAtSequence: number | null;
  failureReason: string | null;
  expectedValue: string | null;
  actualValue: string | null;
}

export class AuditLoggingError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(`Audit logging failure (fail-closed): ${message}`);
    this.name = 'AuditLoggingError';
  }
}

/**
 * Appends a tamper-evident, SHA-256 chained audit record via database-serialized RPC.
 *
 * Security Guarantee:
 * - Operates under privileged service_role with transaction-scoped advisory locking.
 * - FAILS CLOSED: Throws AuditLoggingError if the write fails or is rejected.
 *   Calling routes must abort sensitive actions if this function throws.
 */
export async function logAuditEvent(
  input: AuditLogInput,
  client?: SupabaseClient
): Promise<AuditRecord> {
  const supabase = client || createAdminClient();

  if (!input.action || input.action.trim() === '') {
    throw new AuditLoggingError('Audit action cannot be null or empty');
  }

  if (!input.result || input.result.trim() === '') {
    throw new AuditLoggingError('Audit result cannot be null or empty');
  }

  const { data, error } = await supabase.rpc('append_audit_log', {
    p_actor_id: input.actorId || null,
    p_document_id: input.documentId || null,
    p_action: input.action,
    p_result: input.result,
    p_metadata: input.metadata || {},
    p_ip_address: input.ipAddress || null,
    p_user_agent: input.userAgent || null,
  });

  if (error || !data || data.length === 0) {
    throw new AuditLoggingError(
      error?.message || 'No record returned from append_audit_log',
      error
    );
  }

  const raw = data[0];
  return {
    id: raw.id,
    sequenceNumber: Number(raw.sequence_number),
    actorId: raw.actor_id,
    documentId: raw.document_id,
    action: raw.action,
    result: raw.result,
    timestamp: raw.timestamp,
    prevHash: raw.prev_hash,
    rowHash: raw.row_hash,
    metadata: raw.metadata as Record<string, unknown>,
  };
}

/**
 * Validates cryptographic chain integrity:
 * 1. Monotonic sequence numbers with zero gaps.
 * 2. Hash-link continuity (row N prev_hash === row N-1 row_hash).
 * 3. Canonical payload integrity (recomputed SHA-256 === stored row_hash).
 */
export async function verifyAuditChain(
  fromSequence = 1,
  limit = 1000,
  client?: SupabaseClient
): Promise<AuditVerificationReport> {
  const supabase = client || createAdminClient();

  const { data, error } = await supabase.rpc('verify_audit_chain', {
    p_from_sequence: fromSequence,
    p_limit: limit,
  });

  if (error || !data || data.length === 0) {
    throw new Error(`Audit verification query failed: ${error?.message || 'Unknown error'}`);
  }

  const raw = data[0];
  return {
    isValid: Boolean(raw.is_valid),
    totalVerified: Number(raw.total_verified),
    failedAtSequence: raw.failed_at_sequence !== null ? Number(raw.failed_at_sequence) : null,
    failureReason: raw.failure_reason,
    expectedValue: raw.expected_value,
    actualValue: raw.actual_value,
  };
}

/**
 * Retrieves audit history for a specific document.
 * Centralized authorization check: only document OWNER or ADMIN is allowed.
 * Fails closed if mandatory audit event cannot be written.
 */
export async function getDocumentAuditHistory(
  actorId: string,
  documentId: string,
  query?: Partial<AuditHistoryQuery>,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<GetAuditHistoryResult> {
  // 1. Centralized Authorization Check
  const auth = await authorize(actorId, documentId, 'VIEW_AUDIT');
  if (!auth.allowed) {
    await logAuditEvent({
      actorId,
      documentId,
      action: 'VIEW_AUDIT',
      result: 'ACCESS_DENIED',
      metadata: { reason: auth.reason, scope: 'DOCUMENT' },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});

    return {
      success: false,
      error: 'Document not found or access denied',
      notFoundOrDenied: true,
    };
  }

  // 2. Mandatory Audit Logging (Fails Closed!)
  await logAuditEvent({
    actorId,
    documentId,
    action: 'AUDIT_VIEW',
    result: 'SUCCESS',
    metadata: {
      scope: 'DOCUMENT',
      limit: query?.limit ?? 50,
      offset: query?.offset ?? 0,
      has_action: Boolean(query?.action),
      has_result: Boolean(query?.result),
      has_time_filter: Boolean(query?.startTime || query?.endTime),
    },
    ipAddress: clientIp,
    userAgent: userAgent,
  });

  // 3. Call Server-Only Procedure
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc('get_document_audit_history', {
    p_actor_id: actorId,
    p_document_id: documentId,
    p_limit: query?.limit ?? 50,
    p_offset: query?.offset ?? 0,
    p_action: query?.action || null,
    p_result: query?.result || null,
    p_start_time: query?.startTime || null,
    p_end_time: query?.endTime || null,
  });

  if (error) {
    return {
      success: false,
      error: 'Failed to retrieve document audit history',
    };
  }

  const activities: SafeAuditRecord[] = (data || []).map((row: RawAuditHistoryRow) => ({
    sequenceNumber: Number(row.sequence_number),
    actorId: row.actor_id,
    documentId: row.document_id,
    action: row.action,
    result: row.result,
    timestamp: row.timestamp,
    metadata: (row.safe_metadata as Record<string, unknown>) || {},
  }));

  return {
    success: true,
    activities,
  };
}

/**
 * Retrieves audit history for documents owned by the active user.
 * Scoped strictly to documents where d.owner_id = actorId and deleted_at IS NULL.
 * Fails closed if mandatory audit event cannot be written.
 */
export async function getOwnerAuditHistory(
  actorId: string,
  query?: Partial<AuditHistoryQuery>,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<GetAuditHistoryResult> {
  // If specific documentId is supplied, verify caller owns it
  if (query?.documentId) {
    const auth = await authorize(actorId, query.documentId, 'VIEW_AUDIT');
    if (!auth.allowed) {
      await logAuditEvent({
        actorId,
        documentId: query.documentId,
        action: 'VIEW_AUDIT',
        result: 'ACCESS_DENIED',
        metadata: { reason: auth.reason, scope: 'USER_OWNED' },
        ipAddress: clientIp,
        userAgent: userAgent,
      }).catch(() => {});

      return {
        success: false,
        error: 'Document not found or access denied',
        notFoundOrDenied: true,
      };
    }
  }

  // Mandatory Audit Logging (Fails Closed!)
  await logAuditEvent({
    actorId,
    documentId: query?.documentId || null,
    action: 'AUDIT_VIEW',
    result: 'SUCCESS',
    metadata: {
      scope: 'USER_OWNED',
      filter_doc: Boolean(query?.documentId),
      limit: query?.limit ?? 50,
      offset: query?.offset ?? 0,
      has_action: Boolean(query?.action),
      has_result: Boolean(query?.result),
    },
    ipAddress: clientIp,
    userAgent: userAgent,
  });

  // Call Server-Only Procedure
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc('get_owner_audit_history', {
    p_actor_id: actorId,
    p_limit: query?.limit ?? 50,
    p_offset: query?.offset ?? 0,
    p_document_id: query?.documentId || null,
    p_action: query?.action || null,
    p_result: query?.result || null,
    p_start_time: query?.startTime || null,
    p_end_time: query?.endTime || null,
  });

  if (error) {
    return {
      success: false,
      error: 'Failed to retrieve owner audit history',
    };
  }

  // 4. Defense-in-depth: call the real authorize(actorId, documentId, 'VIEW_AUDIT')
  // for each returned document before serialization.
  // Cache authorization decisions per documentId to minimize redundant checks.
  const authCache = new Map<string, boolean>();
  const safeActivities: SafeAuditRecord[] = [];

  for (const row of (data || []) as RawAuditHistoryRow[]) {
    if (row.document_id) {
      let isAllowed = authCache.get(row.document_id);
      if (isAllowed === undefined) {
        const docAuth = await authorize(actorId, row.document_id, 'VIEW_AUDIT');
        isAllowed = docAuth.allowed;
        authCache.set(row.document_id, isAllowed);
      }
      if (!isAllowed) {
        // Exclude activity for soft-deleted, unowned, or inaccessible documents
        continue;
      }
    }

    safeActivities.push({
      sequenceNumber: Number(row.sequence_number),
      actorId: row.actor_id,
      documentId: row.document_id,
      action: row.action,
      result: row.result,
      timestamp: row.timestamp,
      metadata: (row.safe_metadata as Record<string, unknown>) || {},
    });
  }

  return {
    success: true,
    activities: safeActivities,
  };
}

/**
 * Retrieves system-wide global activity.
 * Centralized authorization check: strictly ADMIN role.
 * Fails closed if mandatory audit event cannot be written.
 */
export async function getAdminGlobalAuditActivity(
  actorId: string,
  query?: Partial<AuditHistoryQuery>,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<GetAuditHistoryResult> {
  // 1. Centralized Authorization Check (Admin only)
  const auth = await authorize(actorId, GLOBAL_AUDIT_DOCUMENT_ID, 'VIEW_AUDIT');
  if (!auth.allowed) {
    await logAuditEvent({
      actorId,
      documentId: null,
      action: 'VIEW_AUDIT',
      result: 'ACCESS_DENIED',
      metadata: { reason: auth.reason, scope: 'GLOBAL' },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});

    return {
      success: false,
      error: 'Unauthorized: Administrator access required',
      forbidden: true,
    };
  }

  // 2. Mandatory Audit Logging (Fails Closed!)
  await logAuditEvent({
    actorId,
    documentId: query?.documentId || null,
    action: 'AUDIT_VIEW',
    result: 'SUCCESS',
    metadata: {
      scope: 'GLOBAL',
      filter_doc: Boolean(query?.documentId),
      limit: query?.limit ?? 50,
      offset: query?.offset ?? 0,
      has_action: Boolean(query?.action),
      has_result: Boolean(query?.result),
    },
    ipAddress: clientIp,
    userAgent: userAgent,
  });

  // 3. Call Server-Only Procedure
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc('get_admin_global_audit_activity', {
    p_actor_id: actorId,
    p_limit: query?.limit ?? 50,
    p_offset: query?.offset ?? 0,
    p_document_id: query?.documentId || null,
    p_action: query?.action || null,
    p_result: query?.result || null,
    p_start_time: query?.startTime || null,
    p_end_time: query?.endTime || null,
  });

  if (error) {
    return {
      success: false,
      error: 'Failed to retrieve global audit activity',
    };
  }

  const activities: SafeAuditRecord[] = (data || []).map((row: RawAuditHistoryRow) => ({
    sequenceNumber: Number(row.sequence_number),
    actorId: row.actor_id,
    documentId: row.document_id,
    action: row.action,
    result: row.result,
    timestamp: row.timestamp,
    metadata: (row.safe_metadata as Record<string, unknown>) || {},
  }));

  return {
    success: true,
    activities,
  };
}

/**
 * Retrieves cryptographic chain health verification summary.
 * Centralized authorization check: strictly ADMIN role.
 * Fails closed if mandatory audit event cannot be written.
 */
export async function getAdminAuditChainSummary(
  actorId: string,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<GetAdminChainSummaryResult> {
  // 1. Centralized Authorization Check (Admin only)
  const auth = await authorize(actorId, GLOBAL_AUDIT_DOCUMENT_ID, 'VIEW_AUDIT');
  if (!auth.allowed) {
    await logAuditEvent({
      actorId,
      documentId: null,
      action: 'VIEW_AUDIT',
      result: 'ACCESS_DENIED',
      metadata: { reason: auth.reason, scope: 'GLOBAL_CHAIN_VERIFY' },
      ipAddress: clientIp,
      userAgent: userAgent,
    }).catch(() => {});

    return {
      success: false,
      error: 'Unauthorized: Administrator access required',
      forbidden: true,
    };
  }

  // 2. Mandatory Audit Logging (Fails Closed!)
  await logAuditEvent({
    actorId,
    documentId: null,
    action: 'AUDIT_VERIFY',
    result: 'SUCCESS',
    metadata: { scope: 'GLOBAL_CHAIN' },
    ipAddress: clientIp,
    userAgent: userAgent,
  });

  // 3. Call Server-Only Procedure
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc('get_admin_audit_chain_summary', {
    p_actor_id: actorId,
  });

  if (error || !data || data.length === 0) {
    return {
      success: false,
      error: 'Failed to verify audit chain',
    };
  }

  const row = data[0];
  return {
    success: true,
    summary: {
      isValid: Boolean(row.is_valid),
      totalVerified: Number(row.total_verified),
      failedAtSequence: row.failed_at_sequence !== null ? Number(row.failed_at_sequence) : null,
      failureReason: row.failure_reason,
      lastVerifiedAt: row.last_verified_at,
    },
  };
}

