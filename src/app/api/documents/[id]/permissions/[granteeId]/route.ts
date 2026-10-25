import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth/session';
import { revokeDocumentPermission } from '@/lib/documents/permissions';
import { logAuditEvent } from '@/lib/audit/audit';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/documents/[id]/permissions/[granteeId]
 * Revokes a document grant immediately.
 * Only the document owner is authorized.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; granteeId: string }> }
) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
  const userAgent = req.headers.get('user-agent');

  try {
    const session = await requireAuth();
    const { id: documentId, granteeId } = await context.params;

    if (
      !documentId ||
      !granteeId ||
      !UUID_REGEX.test(documentId) ||
      !UUID_REGEX.test(granteeId)
    ) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    const result = await revokeDocumentPermission(
      session.user.id,
      documentId,
      granteeId,
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
      if (result.statusCode === 'CANNOT_REVOKE_OWNER') {
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
    });
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const status = err.code === 'ACCOUNT_DISABLED' ? 403 : 401;
      if (err.userId) {
        await logAuditEvent({
          actorId: err.userId,
          action: 'REVOKE',
          result: 'ACCESS_DENIED',
          metadata: { action_type: 'revoke_permission', reason: err.code },
          ipAddress: ip,
          userAgent,
        }).catch(() => {});
      }
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: 'Internal server error processing permission revocation' },
      { status: 500 }
    );
  }
}
