import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth/session';
import { getAdminAuditChainSummary } from '@/lib/audit/audit';

async function handleVerification(request: NextRequest) {
  try {
    // 1. Authenticate caller
    const session = await requireAuth();

    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    // 2. Perform audit chain verification (gates via authorize(..., GLOBAL_AUDIT_DOCUMENT_ID, 'VIEW_AUDIT'))
    const result = await getAdminAuditChainSummary(
      session.user.id,
      clientIp,
      userAgent
    );

    if (result.forbidden) {
      return NextResponse.json(
        { error: 'Unauthorized: Administrator access required' },
        { status: 403 }
      );
    }

    if (!result.success || !result.summary) {
      return NextResponse.json(
        { error: result.error || 'Failed to verify audit chain' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      verification: result.summary,
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

export async function GET(request: NextRequest) {
  return handleVerification(request);
}

export async function POST(request: NextRequest) {
  return handleVerification(request);
}
