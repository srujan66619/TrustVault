import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth/session';
import {
  getDocumentMetadata,
  updateDocumentMetadata,
  softDeleteDocument,
} from '@/lib/documents/documents';
import { validateSameOrigin } from '@/lib/security/csrf';
import { checkDeniedAccessRateLimit } from '@/lib/security/rateLimit';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/documents/[id]
 * Retrieves sanitized metadata for an accessible document.
 * Returns a uniform 404 for nonexistent, forbidden, soft-deleted, or invalid UUIDs
 * to prevent object existence enumeration.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
  const userAgent = req.headers.get('user-agent');

  try {
    const session = await requireAuth();

    const deniedLimit = checkDeniedAccessRateLimit(session.user.id);
    if (!deniedLimit.allowed && deniedLimit.errorResponse) {
      return deniedLimit.errorResponse;
    }

    const { id: documentId } = await context.params;

    if (!documentId || !UUID_REGEX.test(documentId)) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    const doc = await getDocumentMetadata(
      session.user.id,
      documentId,
      ip,
      userAgent
    );

    if (!doc) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({ document: doc });
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const status = err.code === 'ACCOUNT_DISABLED' ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: 'Internal server error retrieving document metadata' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/documents/[id]
 * Updates safe document metadata (display name and category).
 * Allowed for document owner and active EDIT grantees.
 * Returns uniform 404 for forbidden, nonexistent, soft-deleted, or invalid IDs.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const originCheck = validateSameOrigin(req);
  if (!originCheck.valid && originCheck.errorResponse) {
    return originCheck.errorResponse;
  }

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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Malformed JSON payload' },
        { status: 400 }
      );
    }

    const result = await updateDocumentMetadata(
      session.user.id,
      documentId,
      body,
      ip,
      userAgent
    );

    if (!result.success) {
      if (result.notFoundOrDenied) {
        return NextResponse.json(
          { error: 'Document not found or access denied' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: result.error || 'Invalid metadata input' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      document: result.document,
      auditSequenceNumber: result.auditSequenceNumber,
    });
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const status = err.code === 'ACCOUNT_DISABLED' ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: 'Internal server error updating document metadata' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/documents/[id]
 * Soft-deletes a document.
 * Strictly owner-only. Grantees (even with EDIT) receive generic 404.
 * Returns uniform 404 for forbidden, nonexistent, soft-deleted, or invalid IDs.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const originCheck = validateSameOrigin(req);
  if (!originCheck.valid && originCheck.errorResponse) {
    return originCheck.errorResponse;
  }

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

    const result = await softDeleteDocument(
      session.user.id,
      documentId,
      ip,
      userAgent
    );

    if (!result.success) {
      if (result.notFoundOrDenied) {
        return NextResponse.json(
          { error: 'Document not found or access denied' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: result.error || 'Failed to soft-delete document' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedAt: result.deletedAt,
      auditSequenceNumber: result.auditSequenceNumber,
    });
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const status = err.code === 'ACCOUNT_DISABLED' ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: 'Internal server error during document soft deletion' },
      { status: 500 }
    );
  }
}
