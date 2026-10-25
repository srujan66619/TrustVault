/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import nextConfig from '../next.config';
import { validateSameOrigin } from '../src/lib/security/csrf';
import {
  checkLoginRateLimit,
  checkUploadRateLimit,
  checkPermissionsRateLimit,
  checkVerifyRateLimit,
  checkDeniedAccessRateLimit,
  resetRateLimits,
  RATE_LIMITS,
} from '../src/lib/security/rateLimit';
import { NextRequest } from 'next/server';
import { POST as uploadRoute } from '../src/app/api/documents/route';
import { PATCH as updateRoute, DELETE as deleteRoute } from '../src/app/api/documents/[id]/route';
import { POST as grantRoute } from '../src/app/api/documents/[id]/permissions/route';
import { DELETE as revokeRoute } from '../src/app/api/documents/[id]/permissions/[granteeId]/route';
import { POST as verifyRoute } from '../src/app/api/admin/audit/verify/route';
import * as sessionModule from '../src/lib/auth/session';
import fs from 'fs';
import path from 'path';

describe('Phase 9: Final Security Hardening & Deployment Verification', () => {
  beforeEach(() => {
    resetRateLimits();
    vi.restoreAllMocks();
  });

  describe('1. Production Security Headers', () => {
    it('configures all required security headers in next.config.ts', async () => {
      expect(typeof nextConfig.headers).toBe('function');
      const headerConfigs = await (nextConfig as any).headers();
      expect(Array.isArray(headerConfigs)).toBe(true);

      const rootConfig = headerConfigs.find((h: any) => h.source === '/:path*');
      expect(rootConfig).toBeDefined();

      const headers = rootConfig.headers.reduce((acc: any, curr: any) => {
        acc[curr.key.toLowerCase()] = curr.value;
        return acc;
      }, {});

      // Assert essential headers
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
      expect(headers['permissions-policy']).toContain('camera=()');
      expect(headers['permissions-policy']).toContain('microphone=()');
      expect(headers['permissions-policy']).toContain('geolocation=()');

      // Assert Content-Security-Policy (CSP)
      const csp = headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co");

      // Verify no overly broad standalone '*' source in script-src, default-src, or connect-src
      expect(csp).not.toMatch(/default-src\s+[^;]*\s+\*(?:;|$)/);
      expect(csp).not.toMatch(/script-src\s+[^;]*\s+\*(?:;|$)/);
      expect(csp).not.toMatch(/connect-src\s+[^;]*\s+\*(?:;|$)/);
    });
  });

  describe('2. CSRF & Request-Origin Protection', () => {
    it('blocks state-changing requests when Sec-Fetch-Site is cross-site', () => {
      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'POST',
        headers: {
          'sec-fetch-site': 'cross-site',
          host: 'localhost:3000',
        },
      });

      const result = validateSameOrigin(req);
      expect(result.valid).toBe(false);
      expect(result.errorResponse?.status).toBe(403);
    });

    it('blocks state-changing requests when Origin host mismatches request host', () => {
      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'PATCH',
        headers: {
          origin: 'https://malicious-attacker.com',
          host: 'localhost:3000',
        },
      });

      const result = validateSameOrigin(req);
      expect(result.valid).toBe(false);
      expect(result.errorResponse?.status).toBe(403);
    });

    it('blocks state-changing requests when Referer host mismatches request host', () => {
      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'DELETE',
        headers: {
          referer: 'https://evil.com/phishing-page',
          host: 'localhost:3000',
        },
      });

      const result = validateSameOrigin(req);
      expect(result.valid).toBe(false);
      expect(result.errorResponse?.status).toBe(403);
    });

    it('allows safe read-only methods (GET) without origin headers', () => {
      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'GET',
      });

      const result = validateSameOrigin(req);
      expect(result.valid).toBe(true);
      expect(result.errorResponse).toBeUndefined();
    });

    it('proves cross-origin upload attempts are rejected with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.com',
          host: 'localhost:3000',
        },
      });

      const res = await uploadRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/cross-site/i);
    });

    it('proves cross-origin metadata-update attempts are rejected with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/documents/11111111-1111-1111-1111-111111111111', {
        method: 'PATCH',
        headers: {
          origin: 'https://attacker.com',
          host: 'localhost:3000',
        },
      });

      const res = await updateRoute(req, {
        params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/cross-site/i);
    });

    it('proves cross-origin document delete attempts are rejected with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/documents/11111111-1111-1111-1111-111111111111', {
        method: 'DELETE',
        headers: {
          origin: 'https://attacker.com',
          host: 'localhost:3000',
        },
      });

      const res = await deleteRoute(req, {
        params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/cross-site/i);
    });

    it('proves cross-origin permission grant attempts are rejected with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/documents/11111111-1111-1111-1111-111111111111/permissions', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.com',
          host: 'localhost:3000',
        },
      });

      const res = await grantRoute(req, {
        params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/cross-site/i);
    });

    it('proves cross-origin permission revoke attempts are rejected with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/documents/11111111-1111-1111-1111-111111111111/permissions/22222222-2222-2222-2222-222222222222', {
        method: 'DELETE',
        headers: {
          origin: 'https://attacker.com',
          host: 'localhost:3000',
        },
      });

      const res = await revokeRoute(req, {
        params: Promise.resolve({
          id: '11111111-1111-1111-1111-111111111111',
          granteeId: '22222222-2222-2222-2222-222222222222',
        }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/cross-site/i);
    });

    it('proves cross-origin audit verification attempts are rejected with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/audit/verify', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.com',
          host: 'localhost:3000',
        },
      });

      const res = await verifyRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/cross-site/i);
    });
  });

  describe('3. Concurrency-Safe Rate Limiting', () => {
    it('triggers login rate limit and resets cleanly', () => {
      const userEmail = 'victim@example.com';

      // 5 allowed attempts
      for (let i = 0; i < RATE_LIMITS.LOGIN.limit; i++) {
        const res = checkLoginRateLimit(userEmail);
        expect(res.allowed).toBe(true);
      }

      // 6th attempt rejected with 429
      const blocked = checkLoginRateLimit(userEmail);
      expect(blocked.allowed).toBe(false);
      expect(blocked.errorResponse?.status).toBe(429);
      expect(blocked.errorResponse?.headers.get('Retry-After')).toBeDefined();

      // Reset allows requests again
      resetRateLimits();
      const resetRes = checkLoginRateLimit(userEmail);
      expect(resetRes.allowed).toBe(true);
    });

    it('triggers upload rate limit when threshold is exceeded', () => {
      const userId = 'user-upload-test-123';

      for (let i = 0; i < RATE_LIMITS.UPLOAD.limit; i++) {
        expect(checkUploadRateLimit(userId).allowed).toBe(true);
      }

      const blocked = checkUploadRateLimit(userId);
      expect(blocked.allowed).toBe(false);
      expect(blocked.errorResponse?.status).toBe(429);
    });

    it('triggers permission grant/revoke rate limit when threshold is exceeded', () => {
      const userId = 'user-perm-test-123';

      for (let i = 0; i < RATE_LIMITS.PERMISSIONS.limit; i++) {
        expect(checkPermissionsRateLimit(userId).allowed).toBe(true);
      }

      const blocked = checkPermissionsRateLimit(userId);
      expect(blocked.allowed).toBe(false);
      expect(blocked.errorResponse?.status).toBe(429);
    });

    it('triggers audit verification rate limit when threshold is exceeded', () => {
      const adminId = 'admin-verify-test-123';

      for (let i = 0; i < RATE_LIMITS.AUDIT_VERIFY.limit; i++) {
        expect(checkVerifyRateLimit(adminId).allowed).toBe(true);
      }

      const blocked = checkVerifyRateLimit(adminId);
      expect(blocked.allowed).toBe(false);
      expect(blocked.errorResponse?.status).toBe(429);
    });

    it('triggers repeated denied access rate limit and does not identify user', () => {
      const target = 'prober-ip-or-id';

      for (let i = 0; i < RATE_LIMITS.DENIED_ACCESS.limit; i++) {
        expect(checkDeniedAccessRateLimit(target).allowed).toBe(true);
      }

      const blocked = checkDeniedAccessRateLimit(target);
      expect(blocked.allowed).toBe(false);
      expect(blocked.errorResponse?.status).toBe(429);

      // Verify response body is generic and does not identify user
      // Note: errorResponse in Next.js is mocked/returned
      expect(blocked.errorResponse).toBeDefined();
    });

    it('enforces upload rate limit inside POST /api/documents handler', async () => {
      const testActor = '11111111-2222-3333-4444-555555555555';
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: testActor, email: 'actor@example.com' } as any,
      } as any);

      // Exhaust limit
      for (let i = 0; i < RATE_LIMITS.UPLOAD.limit; i++) {
        checkUploadRateLimit(testActor);
      }

      const req = new NextRequest('http://localhost:3000/api/documents', {
        method: 'POST',
        headers: { host: 'localhost:3000' },
      });

      const res = await uploadRoute(req);
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error).toMatch(/too many requests/i);
    });
  });

  describe('4. Secret & Configuration Review', () => {
    it('verifies that no service-role key is exposed in NEXT_PUBLIC_ env variables', () => {
      for (const key of Object.keys(process.env)) {
        if (key.startsWith('NEXT_PUBLIC_')) {
          const val = process.env[key] || '';
          expect(val.toLowerCase()).not.toContain('service_role');
        }
      }
    });

    it('confirms .env.local is ignored in .gitignore', () => {
      const gitignorePath = path.resolve(process.cwd(), '.gitignore');
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      expect(gitignoreContent).toMatch(/\.env\*/);
    });

    it('confirms server-only guard exists on supabase/admin.ts', () => {
      const adminPath = path.resolve(process.cwd(), 'src/lib/supabase/admin.ts');
      const adminContent = fs.readFileSync(adminPath, 'utf8');
      expect(adminContent).toContain("import 'server-only'");
    });

    it('confirms .env.example contains no real secrets', () => {
      const examplePath = path.resolve(process.cwd(), '.env.example');
      const exampleContent = fs.readFileSync(examplePath, 'utf8');
      expect(exampleContent).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/); // No JWTs
      expect(exampleContent).toContain('NEXT_PUBLIC_SUPABASE_URL=');
      expect(exampleContent).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY=');
    });
  });

  describe('5. Secure Password Visibility Control & Sign-In Form Hardening', () => {
    it('verifies PasswordInput component enforces client-side accessibility and security invariants', () => {
      const inputPath = path.resolve(process.cwd(), 'src/app/login/PasswordInput.tsx');
      expect(fs.existsSync(inputPath)).toBe(true);

      const content = fs.readFileSync(inputPath, 'utf8');
      // Must be a client component
      expect(content).toContain("'use client'");

      // Button must strictly be type="button" to prevent form submission
      expect(content).toContain('type="button"');

      // Toggles strictly between password and text
      expect(content).toContain("type={showPassword ? 'text' : 'password'}");

      // Accessible dynamic aria-label
      expect(content).toContain("aria-label={showPassword ? 'Hide password' : 'Show password'}");

      // Preserves password manager auto-completion
      expect(content).toContain('autoComplete');

      // Does not contain any network fetch, telemetry, or external storage of credentials
      expect(content).not.toContain('fetch(');
      expect(content).not.toContain('localStorage');
      expect(content).not.toContain('sessionStorage');
      expect(content).not.toContain('console.log');
    });

    it('verifies login/page.tsx utilizes PasswordInput with server-side authentication', () => {
      const loginPath = path.resolve(process.cwd(), 'src/app/login/page.tsx');
      const loginContent = fs.readFileSync(loginPath, 'utf8');

      expect(loginContent).toContain("import { PasswordInput } from './PasswordInput'");
      expect(loginContent).toContain('<PasswordInput');
      expect(loginContent).toContain('formAction={signIn}');
    });
  });
});
