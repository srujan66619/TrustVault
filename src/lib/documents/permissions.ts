import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorize } from '@/lib/authorization/authorize';
import { logAuditEvent } from '@/lib/audit/audit';
import { z } from 'zod';

export type PermissionLevel = 'READ' | 'EDIT';

export const grantPermissionSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Valid recipient email address is required')
    .max(255, 'Email cannot exceed 255 characters'),
  permission: z.enum(['READ', 'EDIT'], {
    message: "Permission must be exactly 'READ' or 'EDIT'",
  }),
});

export type GrantPermissionInput = z.infer<typeof grantPermissionSchema>;

export interface DocumentPermissionRecord {
  granteeId: string;
  granteeEmail: string;
  permission: PermissionLevel;
  createdAt: string;
  updatedAt: string;
}

export interface GrantResult {
  success: boolean;
  message: string;
  statusCode?: string;
  granteeId?: string | null;
  permission?: PermissionLevel | null;
  auditSequence?: number | null;
}

export interface RevokeResult {
  success: boolean;
  message: string;
  statusCode?: string;
  revokedPermission?: string | null;
  auditSequence?: number | null;
}

/**
 * Grants or updates document permissions for a named user.
 * 
 * CORE SECURITY INVARIANTS:
 * 1. Owner-Exclusive: Only the current document owner can grant permissions.
 * 2. Centralized Authorization: Mandatory authorize(actorId, documentId, 'GRANT') choke-point.
 * 3. Anti-Enumeration: Nonexistent or inactive target users receive a uniform generic response.
 * 4. Atomic Mutation & Audit: Stored procedure creates permission and audit log in one transaction.
 */
export async function grantDocumentPermission(
  actorId: string,
  documentId: string,
  rawInput: unknown,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<GrantResult> {
  // 1. Validate input strictly using Zod
  const parsed = grantPermissionSchema.safeParse(rawInput);
  if (!parsed.success) {
    if (actorId && documentId && z.string().uuid().safeParse(documentId).success) {
      await logAuditEvent({
        actorId,
        documentId,
        action: 'GRANT',
        result: 'ACCESS_DENIED',
        metadata: { reason: 'MALFORMED_INPUT' },
        ipAddress: clientIp,
        userAgent,
      }).catch(() => {});
    }
    const errorMsg = parsed.error.issues.map((i) => i.message).join('; ');
    return { success: false, message: errorMsg, statusCode: 'VALIDATION_FAILED' };
  }

  // 2. Centralized Authorization Check
  const authz = await authorize(actorId, documentId, 'GRANT');
  if (!authz.allowed) {
    await logAuditEvent({
      actorId,
      documentId,
      action: 'GRANT',
      result: 'ACCESS_DENIED',
      metadata: { reason: authz.reason },
      ipAddress: clientIp,
      userAgent,
    }).catch(() => {});
    return {
      success: false,
      message: 'Document not found or access denied',
      statusCode: 'NOT_FOUND_OR_DENIED',
    };
  }

  // 3. Execute atomic grant & audit procedure
  try {
    const adminClient = createAdminClient();
    const { data: rows, error: rpcError } = await adminClient.rpc(
      'grant_or_change_document_permission_and_audit',
      {
        p_actor_id: actorId,
        p_document_id: documentId,
        p_grantee_email: parsed.data.email,
        p_permission: parsed.data.permission,
        p_ip_address: clientIp || null,
        p_user_agent: userAgent || null,
      }
    );

    if (rpcError || !rows || rows.length === 0) {
      return {
        success: false,
        message: 'An error occurred while updating permissions.',
        statusCode: 'PROCEDURE_ERROR',
      };
    }

    const row = rows[0];

    // Generic response for nonexistent or inactive accounts (Anti-Enumeration)
    if (!row.success) {
      if (row.status_code === 'TARGET_NOT_FOUND' || row.status_code === 'TARGET_INACTIVE') {
        return {
          success: true,
          message: 'Permission update processed. If an active account exists with that email, access was updated.',
          statusCode: 'GENERIC_PROCESSED',
          auditSequence: Number(row.audit_sequence_number),
        };
      }
      if (row.status_code === 'CANNOT_GRANT_OWNER') {
        return {
          success: false,
          message: 'Document owner cannot be added as a grantee on their own document.',
          statusCode: 'CANNOT_GRANT_OWNER',
          auditSequence: Number(row.audit_sequence_number),
        };
      }
      return {
        success: false,
        message: 'Document not found or access denied',
        statusCode: 'NOT_FOUND_OR_DENIED',
        auditSequence: Number(row.audit_sequence_number),
      };
    }

    return {
      success: true,
      message: 'Permission granted successfully.',
      statusCode: row.status_code,
      granteeId: row.grantee_id,
      permission: row.permission as PermissionLevel,
      auditSequence: Number(row.audit_sequence_number),
    };
  } catch {
    return {
      success: false,
      message: 'Internal error processing permission grant.',
      statusCode: 'INTERNAL_ERROR',
    };
  }
}

/**
 * Revokes access to a document from a grantee.
 * 
 * CORE SECURITY INVARIANTS:
 * 1. Owner-Exclusive: Only the current document owner can revoke access.
 * 2. Centralized Authorization: Mandatory authorize(actorId, documentId, 'REVOKE') choke-point.
 * 3. Immediate Revocation: Once committed, former grantee receives immediate 404 on all subsequent routes.
 * 4. Invariant Ownership: Owner cannot be revoked.
 */
export async function revokeDocumentPermission(
  actorId: string,
  documentId: string,
  granteeId: string,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<RevokeResult> {
  // 1. Validate grantee UUID format
  if (!z.string().uuid().safeParse(granteeId).success) {
    if (actorId && documentId && z.string().uuid().safeParse(documentId).success) {
      await logAuditEvent({
        actorId,
        documentId,
        action: 'REVOKE',
        result: 'ACCESS_DENIED',
        metadata: { reason: 'MALFORMED_INPUT' },
        ipAddress: clientIp,
        userAgent,
      }).catch(() => {});
    }
    return {
      success: false,
      message: 'Invalid grantee ID format',
      statusCode: 'VALIDATION_FAILED',
    };
  }

  // 2. Centralized Authorization Check
  const authz = await authorize(actorId, documentId, 'REVOKE');
  if (!authz.allowed) {
    await logAuditEvent({
      actorId,
      documentId,
      action: 'REVOKE',
      result: 'ACCESS_DENIED',
      metadata: { reason: authz.reason },
      ipAddress: clientIp,
      userAgent,
    }).catch(() => {});
    return {
      success: false,
      message: 'Document not found or access denied',
      statusCode: 'NOT_FOUND_OR_DENIED',
    };
  }

  // 3. Execute atomic revoke & audit procedure
  try {
    const adminClient = createAdminClient();
    const { data: rows, error: rpcError } = await adminClient.rpc(
      'revoke_document_permission_and_audit',
      {
        p_actor_id: actorId,
        p_document_id: documentId,
        p_grantee_id: granteeId,
        p_ip_address: clientIp || null,
        p_user_agent: userAgent || null,
      }
    );

    if (rpcError || !rows || rows.length === 0) {
      if (rpcError?.message?.includes('Document owner cannot be revoked')) {
        return {
          success: false,
          message: 'Document owner permissions cannot be revoked.',
          statusCode: 'CANNOT_REVOKE_OWNER',
        };
      }

      return {
        success: false,
        message: 'An error occurred while revoking permissions.',
        statusCode: 'PROCEDURE_ERROR',
      };
    }

    const row = rows[0];

    if (!row.success) {
      if (row.status_code === 'CANNOT_REVOKE_OWNER') {
        return {
          success: false,
          message: 'Document owner permissions cannot be revoked.',
          statusCode: 'CANNOT_REVOKE_OWNER',
          auditSequence: Number(row.audit_sequence_number),
        };
      }
      if (row.status_code === 'PERMISSION_NOT_FOUND') {
        return {
          success: true,
          message: 'Permission revocation processed.',
          statusCode: 'ALREADY_REVOKED',
          auditSequence: Number(row.audit_sequence_number),
        };
      }
      return {
        success: false,
        message: 'Document not found or access denied',
        statusCode: 'NOT_FOUND_OR_DENIED',
        auditSequence: Number(row.audit_sequence_number),
      };
    }

    return {
      success: true,
      message: 'Permission revoked successfully.',
      statusCode: 'SUCCESS',
      revokedPermission: row.revoked_permission,
      auditSequence: Number(row.audit_sequence_number),
    };
  } catch {
    return {
      success: false,
      message: 'Internal error processing permission revocation.',
      statusCode: 'INTERNAL_ERROR',
    };
  }
}

interface ListPermissionsRpcRow {
  grantee_id: string;
  grantee_email: string;
  permission: string;
  created_at: string;
  updated_at: string;
}

/**
 * Lists all active permissions granted on a document.
 * Accessible strictly by the current document owner.
 */
export async function listDocumentPermissions(
  actorId: string,
  documentId: string
): Promise<DocumentPermissionRecord[]> {
  // 1. Centralized Authorization Check (Only owner can list permissions)
  const authz = await authorize(actorId, documentId, 'GRANT');
  if (!authz.allowed) {
    return [];
  }

  // 2. Fetch permissions via server-only RPC
  const adminClient = createAdminClient();
  const { data: rows, error } = await adminClient.rpc(
    'list_document_permissions_for_owner',
    {
      p_actor_id: actorId,
      p_document_id: documentId,
    }
  );

  if (error || !rows) {
    return [];
  }

  return (rows as ListPermissionsRpcRow[]).map((r) => ({
    granteeId: r.grantee_id,
    granteeEmail: r.grantee_email,
    permission: r.permission as PermissionLevel,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
