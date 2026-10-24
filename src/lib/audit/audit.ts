import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditAction =
  | 'READ'
  | 'DOWNLOAD'
  | 'EDIT'
  | 'DELETE'
  | 'GRANT'
  | 'REVOKE'
  | 'VIEW_AUDIT'
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
