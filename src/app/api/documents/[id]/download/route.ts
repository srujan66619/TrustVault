import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth/session';
import { downloadDocument } from '@/lib/documents/documents';
import { sanitizeFilename } from '@/lib/documents/validation';


const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/documents/[id]/download
 * Secure streaming download endpoint.
 * Directs bytes from private storage through server response.
 * Never issues signed URLs or leaks storage paths.
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

    // Reject invalid UUIDs uniformly without leaking existence
    if (!documentId || !UUID_REGEX.test(documentId)) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    const downloadResult = await downloadDocument(
      session.user.id,
      documentId,
      ip,
      userAgent
    );

    if (!downloadResult.success || !downloadResult.stream) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    const safeName = sanitizeFilename(downloadResult.filename || 'document');
    const encodedName = encodeURIComponent(safeName);

    // Build secure download headers (RFC 5987 filename encoding, nosniff, private cache)
    const headers = new Headers();
    headers.set('Content-Type', downloadResult.contentType || 'application/octet-stream');
    headers.set(
      'Content-Disposition',
      `attachment; filename="${safeName.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`
    );
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');

    if (downloadResult.contentLength) {
      headers.set('Content-Length', downloadResult.contentLength.toString());
    }

    // Return binary stream directly through Next.js Response
    return new NextResponse(downloadResult.stream as BodyInit, {
      status: 200,
      headers,
    });
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const status = err.code === 'ACCOUNT_DISABLED' ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: 'Internal server error processing document download' },
      { status: 500 }
    );
  }
}
