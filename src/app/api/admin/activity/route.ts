import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth/session';
import { auditHistoryQuerySchema } from '@/lib/audit/validation';
import { getAdminGlobalAuditActivity } from '@/lib/audit/audit';

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate caller
    const session = await requireAuth();

    // 2. Validate query parameters
    const { searchParams } = new URL(request.url);
    const rawParams = {
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
      documentId: searchParams.get('documentId') || undefined,
      action: searchParams.get('action') || undefined,
      result: searchParams.get('result') || undefined,
      startTime: searchParams.get('startTime') || undefined,
      endTime: searchParams.get('endTime') || undefined,
    };

    const parsed = auditHistoryQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    // 3. Retrieve admin global activity (gates via authorize(..., GLOBAL_AUDIT_DOCUMENT_ID, 'VIEW_AUDIT'))
    const result = await getAdminGlobalAuditActivity(
      session.user.id,
      parsed.data,
      clientIp,
      userAgent
    );

    if (result.forbidden) {
      return NextResponse.json(
        { error: 'Unauthorized: Administrator access required' },
        { status: 403 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to retrieve global activity' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      activities: result.activities || [],
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      if (error.code === 'ACCOUNT_DISABLED') {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Audit logging failure (fail-closed): request aborted' },
      { status: 500 }
    );
  }
}
