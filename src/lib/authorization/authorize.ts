import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type DocumentAction =
  | 'READ'
  | 'DOWNLOAD'
  | 'EDIT'
  | 'DELETE'
  | 'GRANT'
  | 'REVOKE'
  | 'VIEW_AUDIT';

export type UserRole = 'ADMIN' | 'OWNER' | 'VIEWER';
export type UserStatus = 'ACTIVE' | 'DISABLED';
export type GrantPermission = 'READ' | 'EDIT';

export type AuthorizationFailureReason =
  | 'UNAUTHENTICATED'
  | 'ACCOUNT_DISABLED'
  | 'NOT_FOUND_OR_DENIED'
  | 'UNAUTHORIZED_ACTION'
  | 'INVALID_PARAMETERS';

export interface AuthorizationResult {
  allowed: boolean;
  reason: 'AUTHORIZED' | AuthorizationFailureReason;
  userId: string;
  documentId: string;
  action: DocumentAction;
  userRole?: UserRole;
  isOwner?: boolean;
  grantPermission?: GrantPermission | null;
}

export interface RawAuthorizationContext {
  user_found: boolean;
  user_role: UserRole | null;
  user_status: UserStatus | null;
  doc_found: boolean;
  doc_owner_id: string | null;
  doc_deleted: boolean;
  grant_permission: GrantPermission | null;
}

export type ContextFetcher = (
  userId: string,
  documentId: string
) => Promise<RawAuthorizationContext>;

/**
 * Default live context fetcher using the server Supabase RPC get_authorization_context.
 */
export async function fetchLiveAuthorizationContext(
  userId: string,
  documentId: string
): Promise<RawAuthorizationContext> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_authorization_context', {
    p_user_id: userId,
    p_document_id: documentId,
  });

  if (error || !data) {
    return {
      user_found: false,
      user_role: null,
      user_status: null,
      doc_found: false,
      doc_owner_id: null,
      doc_deleted: false,
      grant_permission: null,
    };
  }

  return data as RawAuthorizationContext;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_ACTIONS: ReadonlySet<DocumentAction> = new Set([
  'READ',
  'DOWNLOAD',
  'EDIT',
  'DELETE',
  'GRANT',
  'REVOKE',
  'VIEW_AUDIT',
]);

/**
 * Evaluates authorization for document operations.
 * 
 * CORE SECURITY INVARIANTS:
 * 1. Single Central Decision Point: All document access decisions must route through here.
 * 2. Deny by Default: Any unhandled branch or error immediately returns allowed: false.
 * 3. Never Trust Client Claims: userRole and userStatus are strictly read from the live database.
 * 4. Disabled Account Denial: Any user with status != 'ACTIVE' is denied regardless of role/grants.
 * 5. Owner Privileges: The document owner has full lifecycle control (READ, DOWNLOAD, EDIT, DELETE,
 *    GRANT, REVOKE, VIEW_AUDIT).
 * 6. Grantee Privileges:
 *    - READ grantees can ONLY READ and DOWNLOAD.
 *    - EDIT grantees can ONLY READ, DOWNLOAD, and EDIT.
 *    - Grantees can NEVER DELETE, GRANT, REVOKE, or VIEW_AUDIT.
 * 7. Admin Scope (Zero-Trust):
 *    - Admin role allows VIEW_AUDIT for system audit compliance.
 *    - Admin role DOES NOT grant automatic access to read, edit, download, or delete private user
 *      documents without explicit ownership or grantee permissions.
 * 8. Anti-Enumeration & IDOR Defense:
 *    - Unauthorized callers and queries for nonexistent/soft-deleted documents receive a uniform
 *      'NOT_FOUND_OR_DENIED' failure, preventing attackers from probing document existence.
 */
export async function authorize(
  userId: string,
  documentId: string,
  action: DocumentAction,
  options?: {
    contextFetcher?: ContextFetcher;
  }
): Promise<AuthorizationResult> {
  // 1. Parameter Validation (Reject invalid UUIDs and invalid actions)
  if (
    !userId ||
    !documentId ||
    !UUID_REGEX.test(userId) ||
    !UUID_REGEX.test(documentId) ||
    !VALID_ACTIONS.has(action)
  ) {
    return {
      allowed: false,
      reason: 'INVALID_PARAMETERS',
      userId: userId || '',
      documentId: documentId || '',
      action,
    };
  }

  // 2. Fetch live database security context
  const fetcher = options?.contextFetcher ?? fetchLiveAuthorizationContext;
  let context: RawAuthorizationContext;
  try {
    context = await fetcher(userId, documentId);
  } catch {
    return {
      allowed: false,
      reason: 'NOT_FOUND_OR_DENIED',
      userId,
      documentId,
      action,
    };
  }

  // 3. User verification and active status check
  if (!context.user_found || !context.user_role) {
    return {
      allowed: false,
      reason: 'NOT_FOUND_OR_DENIED',
      userId,
      documentId,
      action,
    };
  }

  if (context.user_status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: 'ACCOUNT_DISABLED',
      userId,
      documentId,
      action,
      userRole: context.user_role,
    };
  }

  // 4. Document existence and soft-delete check
  // Uniform denial reason prevents document ID existence enumeration
  if (!context.doc_found || context.doc_deleted || !context.doc_owner_id) {
    return {
      allowed: false,
      reason: 'NOT_FOUND_OR_DENIED',
      userId,
      documentId,
      action,
      userRole: context.user_role,
    };
  }

  const isOwner = context.doc_owner_id === userId;

  // 5. Document Owner Evaluation
  if (isOwner) {
    // Owner is authorized for all 7 supported document actions
    return {
      allowed: true,
      reason: 'AUTHORIZED',
      userId,
      documentId,
      action,
      isOwner: true,
      userRole: context.user_role,
    };
  }

  // 6. Admin Role Evaluation
  // Explicitly defined and documented:
  // - VIEW_AUDIT is allowed for compliance monitoring.
  // - Private document content actions (READ, DOWNLOAD, EDIT, DELETE, GRANT, REVOKE) are NOT
  //   automatically bypassed by the ADMIN role.
  if (context.user_role === 'ADMIN' && action === 'VIEW_AUDIT') {
    return {
      allowed: true,
      reason: 'AUTHORIZED',
      userId,
      documentId,
      action,
      isOwner: false,
      userRole: 'ADMIN',
    };
  }

  // 7. Explicit Grantee Evaluation
  const grant = context.grant_permission;

  if (grant === 'READ') {
    if (action === 'READ' || action === 'DOWNLOAD') {
      return {
        allowed: true,
        reason: 'AUTHORIZED',
        userId,
        documentId,
        action,
        isOwner: false,
        userRole: context.user_role,
        grantPermission: 'READ',
      };
    }
    // Attempted EDIT, DELETE, GRANT, REVOKE, VIEW_AUDIT
    return {
      allowed: false,
      reason: 'UNAUTHORIZED_ACTION',
      userId,
      documentId,
      action,
      isOwner: false,
      userRole: context.user_role,
      grantPermission: 'READ',
    };
  }

  if (grant === 'EDIT') {
    if (action === 'READ' || action === 'DOWNLOAD' || action === 'EDIT') {
      return {
        allowed: true,
        reason: 'AUTHORIZED',
        userId,
        documentId,
        action,
        isOwner: false,
        userRole: context.user_role,
        grantPermission: 'EDIT',
      };
    }
    // Attempted DELETE, GRANT, REVOKE, VIEW_AUDIT
    return {
      allowed: false,
      reason: 'UNAUTHORIZED_ACTION',
      userId,
      documentId,
      action,
      isOwner: false,
      userRole: context.user_role,
      grantPermission: 'EDIT',
    };
  }

  // 8. Unrelated user (No grant, not owner, not authorized admin action)
  return {
    allowed: false,
    reason: 'NOT_FOUND_OR_DENIED',
    userId,
    documentId,
    action,
    isOwner: false,
    userRole: context.user_role,
    grantPermission: null,
  };
}
