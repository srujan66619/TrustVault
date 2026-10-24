import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth/session';
import {
  uploadDocument,
  listAccessibleDocuments,
} from '@/lib/documents/documents';
import { sanitizeFilename } from '@/lib/documents/validation';
import { logAuditEvent } from '@/lib/audit/audit';


/**
 * POST /api/documents
 * Secure document upload endpoint.
 * Accepts multipart/form-data with fields:
 * - 'file': raw binary file
 * - 'displayName' / 'title': optional override title
 * - 'category': optional category string
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
  const userAgent = req.headers.get('user-agent');

  try {
    const session = await requireAuth();

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided in form-data payload' },
        { status: 400 }
      );
    }

    const rawDisplayName =
      (formData.get('displayName') as string) ||
      (formData.get('title') as string) ||
      file.name;
    const category = (formData.get('category') as string) || 'general';

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    const result = await uploadDocument(
      session.user.id,
      fileBuffer,
      file.name,
      {
        displayName: sanitizeFilename(rawDisplayName),
        category: category,
      },
      ip,
      userAgent
    );

    if (!result.success || !result.document) {
      return NextResponse.json(
        { error: result.error || 'Upload failed' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { document: result.document },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const status = err.code === 'ACCOUNT_DISABLED' ? 403 : 401;
      if (err.userId) {
        await logAuditEvent({
          actorId: err.userId,
          action: 'UPLOAD',
          result: 'ACCESS_DENIED',
          metadata: { action_type: 'upload_document', reason: err.code },
          ipAddress: ip,
          userAgent: userAgent,
        }).catch(() => {});
      }
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: 'Internal server error processing document upload' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/documents
 * Lists and searches accessible documents for the current authenticated user.
 * Filters are applied inside the PostgreSQL database query.
 * Query Parameters:
 * - 'q': search query for document display name
 * - 'category': category filter
 * - 'limit': pagination limit (default: 50, max: 100)
 * - 'offset': pagination offset (default: 0)
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
  const userAgent = req.headers.get('user-agent');

  try {
    const session = await requireAuth();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('q');
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const documents = await listAccessibleDocuments(
      session.user.id,
      search,
      category,
      isNaN(limit) ? 50 : limit,
      isNaN(offset) ? 0 : offset,
      ip,
      userAgent
    );

    return NextResponse.json({ documents });
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const status = err.code === 'ACCOUNT_DISABLED' ? 403 : 401;
      if (err.userId) {
        await logAuditEvent({
          actorId: err.userId,
          action: 'READ',
          result: 'ACCESS_DENIED',
          metadata: { action_type: 'list_documents', reason: err.code },
          ipAddress: ip,
          userAgent: userAgent,
        }).catch(() => {});
      }
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: 'Internal server error retrieving documents' },
      { status: 500 }
    );
  }
}
