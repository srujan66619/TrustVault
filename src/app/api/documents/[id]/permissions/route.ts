import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth/session';
import {
  grantDocumentPermission,
  listDocumentPermissions,
} from '@/lib/documents/permissions';
import { logAuditEvent } from '@/lib/audit/audit';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/documents/[id]/permissions
 * Lists current permission grants on a document.
 * Only the document owner is authorized.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: documentId } = await context.params;

    if (!documentId || !UUID_REGEX.test(documentId)) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    const permissions = await listDocumentPermissions(session.user.id, documentId);

    return NextResponse.json({ permissions });
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const status = err.code === 'ACCOUNT_DISABLED' ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: 'Internal server error retrieving document permissions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents/[id]/permissions
 * Grants or updates READ or EDIT permissions on a document.
 * Enforces owner-only authorization and non-enumerable target user handling.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
  const userAgent = req.headers.get('user-agent');

  try {
    const session = await requireAuth();
    const { id: documentId } = await context.params;

    if (!documentId || !UUID_REGEX.test(documentId)) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON request payload' },
        { status: 400 }
      );
    }

    const result = await grantDocumentPermission(
      session.user.id,
      documentId,
      body,
      ip,
      userAgent
    );

    if (!result.success) {
      if (result.statusCode === 'NOT_FOUND_OR_DENIED') {
        return NextResponse.json(
          { error: 'Document not found or access denied' },
          { status: 404 }
        );
      }
      if (result.statusCode === 'CANNOT_GRANT_OWNER') {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      permission: result.permission,
    });
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const status = err.code === 'ACCOUNT_DISABLED' ? 403 : 401;
      if (err.userId) {
        await logAuditEvent({
          actorId: err.userId,
          action: 'GRANT',
          result: 'ACCESS_DENIED',
          metadata: { action_type: 'grant_permission', reason: err.code },
          ipAddress: ip,
          userAgent,
        }).catch(() => {});
      }
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: 'Internal server error processing permission grant' },
      { status: 500 }
    );
  }
}
