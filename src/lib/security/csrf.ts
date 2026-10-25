import { NextRequest, NextResponse } from 'next/server';

export interface OriginValidationResult {
  valid: boolean;
  errorResponse?: NextResponse;
}

/**
 * Validates that state-changing requests (POST, PATCH, DELETE, PUT)
 * originate from the same origin to defend against Cross-Site Request Forgery (CSRF).
 *
 * Implements OWASP Fetch Metadata & Origin Verification:
 * 1. Fetch Metadata `Sec-Fetch-Site`: if 'cross-site', immediately blocked.
 * 2. `Origin` header: if present, must match the target request's host/origin.
 * 3. Fallback `Referer` header: if present and Origin is absent, Referer origin must match.
 *
 * Browsers strictly enforce forbidden headers, ensuring cross-site requests
 * always include `Sec-Fetch-Site: cross-site` or a mismatched `Origin`.
 *
 * Returns a uniform generic HTTP 403 Forbidden on violation.
 */
export function validateSameOrigin(req: NextRequest): OriginValidationResult {
  const method = req.method.toUpperCase();

  // Safe read-only methods do not modify state
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { valid: true };
  }

  // 1. Fetch Metadata check (modern browsers)
  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite.toLowerCase() === 'cross-site') {
    return {
      valid: false,
      errorResponse: NextResponse.json(
        { error: 'Invalid request origin or cross-site request blocked' },
        { status: 403 }
      ),
    };
  }

  // 2. Derive expected host from request
  const hostHeader =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    req.nextUrl?.host ||
    'localhost:3000';

  const originHeader = req.headers.get('origin');

  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      // Strip port if comparing or match host directly
      if (hostHeader && originUrl.host.toLowerCase() !== hostHeader.toLowerCase()) {
        return {
          valid: false,
          errorResponse: NextResponse.json(
            { error: 'Invalid request origin or cross-site request blocked' },
            { status: 403 }
          ),
        };
      }
    } catch {
      return {
        valid: false,
        errorResponse: NextResponse.json(
          { error: 'Invalid request origin or cross-site request blocked' },
          { status: 403 }
        ),
      };
    }
  }

  // 3. Fallback to Referer header if Origin is absent
  const refererHeader = req.headers.get('referer');
  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      if (hostHeader && refererUrl.host.toLowerCase() !== hostHeader.toLowerCase()) {
        return {
          valid: false,
          errorResponse: NextResponse.json(
            { error: 'Invalid request origin or cross-site request blocked' },
            { status: 403 }
          ),
        };
      }
    } catch {
      return {
        valid: false,
        errorResponse: NextResponse.json(
          { error: 'Invalid request origin or cross-site request blocked' },
          { status: 403 }
        ),
      };
    }
  }

  return { valid: true };
}
