import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth/session';
import {
  uploadDocument,
  listAccessibleDocuments,
} from '@/lib/documents/documents';
import { sanitizeFilename, listDocumentsQuerySchema } from '@/lib/documents/validation';
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
 * - 'q' / 'search': search query for document display name
 * - 'category': category filter
 * - 'createdAfter': ISO 8601 timestamp string
 * - 'createdBefore': ISO 8601 timestamp string
 * - 'ownerFilter': 'all' | 'mine' | 'shared'
 * - 'limit': pagination limit (default: 50, max: 100)
 * - 'offset': pagination offset (default: 0)
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
  const userAgent = req.headers.get('user-agent');

  try {
    const session = await requireAuth();

    const { searchParams } = new URL(req.url);
    const rawSearch = searchParams.get('q') ?? searchParams.get('search');
    const rawCategory = searchParams.get('category');
    const rawCreatedAfter = searchParams.get('createdAfter');
    const rawCreatedBefore = searchParams.get('createdBefore');
    const rawOwnerFilter = searchParams.get('ownerFilter');
    const rawLimit = searchParams.get('limit');
    const rawOffset = searchParams.get('offset');

    const parsed = listDocumentsQuerySchema.safeParse({
      search: rawSearch ? rawSearch : undefined,
      category: rawCategory ? rawCategory : undefined,
      createdAfter: rawCreatedAfter ? rawCreatedAfter : undefined,
      createdBefore: rawCreatedBefore ? rawCreatedBefore : undefined,
      ownerFilter: rawOwnerFilter ? rawOwnerFilter : 'all',
      limit: rawLimit ? rawLimit : 50,
      offset: rawOffset ? rawOffset : 0,
    });

    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const documents = await listAccessibleDocuments(session.user.id, {
      ...parsed.data,
      clientIp: ip,
      userAgent,
    });

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
