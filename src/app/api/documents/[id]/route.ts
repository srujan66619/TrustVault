import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth/session';
import { getDocumentMetadata } from '@/lib/documents/documents';


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
    const { id: documentId } = await context.params;

    // Validate UUID structure (fail uniform 404 on malformed input)
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
