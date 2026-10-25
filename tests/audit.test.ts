/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getDocumentAuditHistory,
  getAdminGlobalAuditActivity,
  AuditLoggingError,
} from '../src/lib/audit/audit';
import { GET as getDocActivityRoute } from '../src/app/api/documents/[id]/activity/route';
import { GET as getUserActivityRoute } from '../src/app/api/activity/route';
import { GET as getAdminActivityRoute } from '../src/app/api/admin/activity/route';
import { GET as getAdminVerifyRoute, POST as postAdminVerifyRoute } from '../src/app/api/admin/audit/verify/route';
import * as sessionModule from '../src/lib/auth/session';
import * as adminModule from '../src/lib/supabase/admin';
import * as serverSupabaseModule from '../src/lib/supabase/server';
import * as authorizeModule from '../src/lib/authorization/authorize';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mgqrzzbyzuyygufcpaun.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncXJ6emJ5enV5eWd1ZmNwYXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MzY3NjYsImV4cCI6MjEwODMxMjc2Nn0.WAsQeAE_DW56-PywWFp_9IG43Oy0b_UiuJtdg-thSy4';

describe('Phase 8: Protected Activity History & Admin Audit-Chain Verification (audit.test.ts)', () => {
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ownerUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'owner@trustvault.local',
    role: 'OWNER' as const,
    status: 'ACTIVE' as const,
  };

  const adminUser = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'admin@trustvault.local',
    role: 'ADMIN' as const,
    status: 'ACTIVE' as const,
  };

  const granteeUser = {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'grantee@trustvault.local',
    role: 'VIEWER' as const,
    status: 'ACTIVE' as const,
  };

  const unrelatedUser = {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'unrelated@trustvault.local',
    role: 'VIEWER' as const,
    status: 'ACTIVE' as const,
  };

  const disabledUser = {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'disabled@trustvault.local',
    role: 'OWNER' as const,
    status: 'DISABLED' as const,
  };

  const testDocId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const unownedDocId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  /**
   * Mocks the underlying database context returned to the REAL authorize() module
   * via serverSupabaseModule.createClient() -> rpc('get_authorization_context').
   * This guarantees that the real authorize() logic is executed across all tests.
   */
  const mockAuthorizationContext = (overrides?: {
    userId?: string;
    documentId?: string;
    role?: 'ADMIN' | 'OWNER' | 'VIEWER';
    status?: 'ACTIVE' | 'DISABLED';
    docOwnerId?: string | null;
    docDeleted?: boolean;
    grantPermission?: 'READ' | 'EDIT' | null;
  }) => {
    vi.spyOn(serverSupabaseModule, 'createClient').mockResolvedValue({
      rpc: vi.fn().mockImplementation((procedureName: string, args: { p_user_id: string; p_document_id: string }) => {
        if (procedureName === 'get_authorization_context') {
          const isGlobal = args.p_document_id === authorizeModule.GLOBAL_AUDIT_DOCUMENT_ID;
          let role = overrides?.role;
          let status = overrides?.status ?? 'ACTIVE';
          let docOwnerId = overrides?.docOwnerId !== undefined ? overrides.docOwnerId : ownerUser.id;
          const docDeleted = overrides?.docDeleted ?? false;
          const grantPermission = overrides?.grantPermission ?? null;

          if (!role) {
            if (args.p_user_id === adminUser.id) role = 'ADMIN';
            else if (args.p_user_id === ownerUser.id) role = 'OWNER';
            else role = 'VIEWER';
          }

          if (args.p_user_id === disabledUser.id) {
            status = 'DISABLED';
          }

          // If querying unownedDocId without override, doc owner is unrelatedUser
          if (args.p_document_id === unownedDocId && overrides?.docOwnerId === undefined) {
            docOwnerId = unrelatedUser.id;
          }

          return Promise.resolve({
            data: {
              user_found: true,
              user_role: role,
              user_status: status,
              doc_found: !isGlobal && docOwnerId !== null,
              doc_owner_id: isGlobal ? null : docOwnerId,
              doc_deleted: docDeleted,
              grant_permission: grantPermission,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    } as any);
  };

  // ==========================================================================
  // SECTION 1: Live Supabase Least-Privilege & Procedure Lockdown
  // ==========================================================================
  describe('1. Live Supabase Least-Privilege & Procedure Lockdown', () => {
    it('verifies that unprivileged browser client (anon) CANNOT direct SELECT from audit_logs', async () => {
      const { data, error } = await anonClient.from('audit_logs').select('*');

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for table audit_logs/i);
    });

    it('verifies that unprivileged browser client (anon) CANNOT direct INSERT into audit_logs', async () => {
      const { data, error } = await anonClient.from('audit_logs').insert({
        action: 'DIRECT_INJECTION',
        result: 'SUCCESS',
        sequence_number: 999999,
        prev_hash: '0000000000000000000000000000000000000000000000000000000000000000',
        row_hash: '1111111111111111111111111111111111111111111111111111111111111111',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for table audit_logs/i);
    });

    it('verifies that unprivileged browser client (anon) CANNOT execute append_audit_log', async () => {
      const { data, error } = await anonClient.rpc('append_audit_log', {
        p_actor_id: ownerUser.id,
        p_document_id: null,
        p_action: 'DIRECT_RPC',
        p_result: 'SUCCESS',
        p_metadata: {},
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for function append_audit_log/i);
    });

    it('verifies that unprivileged browser client (anon) CANNOT execute verify_audit_chain', async () => {
      const { data, error } = await anonClient.rpc('verify_audit_chain', {
        p_start_sequence: 1,
        p_batch_size: 100,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied|schema cache/i);
    });

    it('verifies that unprivileged browser client (anon) CANNOT execute Phase 8 procedures', async () => {
      const procs = [
        'get_document_audit_history',
        'get_owner_audit_history',
        'get_admin_global_audit_activity',
        'get_admin_audit_chain_summary',
      ];

      for (const proc of procs) {
        const { data, error } = await anonClient.rpc(proc, {
          p_actor_id: ownerUser.id,
        });

        expect(data).toBeNull();
        expect(error).not.toBeNull();
        expect(error?.message).toMatch(new RegExp(`permission denied for function ${proc}|schema cache`, 'i'));
      }
    });
  });

  // ==========================================================================
  // SECTION 2: Document Audit History Domain Service & Route Tests
  // ==========================================================================
  describe('2. Document Audit History Scoping & Anti-Enumeration', () => {
    it('allows document owner to view document audit history and logs AUDIT_VIEW event using real authorize()', async () => {
      mockAuthorizationContext({ docOwnerId: ownerUser.id });

      let auditLogged = false;
      const mockAdminClient = {
        rpc: vi.fn().mockImplementation((procName: string) => {
          if (procName === 'append_audit_log') {
            auditLogged = true;
            return Promise.resolve({
              data: [
                {
                  id: '00000000-0000-0000-0000-000000000001',
                  sequence_number: '10',
                  actor_id: ownerUser.id,
                  document_id: testDocId,
                  action: 'AUDIT_VIEW',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  prev_hash: 'prev',
                  row_hash: 'row',
                  metadata: {},
                },
              ],
              error: null,
            });
          }
          if (procName === 'get_document_audit_history') {
            return Promise.resolve({
              data: [
                {
                  sequence_number: 1,
                  actor_id: ownerUser.id,
                  document_id: testDocId,
                  action: 'DOCUMENT_CREATE',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  safe_metadata: { filename: 'report.pdf' },
                },
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      const result = await getDocumentAuditHistory(ownerUser.id, testDocId);
      expect(result.success).toBe(true);
      expect(result.activities).toHaveLength(1);
      expect(result.activities![0].action).toBe('DOCUMENT_CREATE');
      expect(result.activities![0].sequenceNumber).toBe(1);
      expect(auditLogged).toBe(true);
    });

    it('denies READ and EDIT grantees document audit history with generic notFoundOrDenied without leaking doc existence using real authorize()', async () => {
      // 1. READ Grantee
      mockAuthorizationContext({ docOwnerId: ownerUser.id, grantPermission: 'READ' });

      const mockAdminClient = {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      const resultRead = await getDocumentAuditHistory(granteeUser.id, testDocId);
      expect(resultRead.success).toBe(false);
      expect(resultRead.notFoundOrDenied).toBe(true);
      expect(resultRead.error).toBe('Document not found or access denied');
      expect(mockAdminClient.rpc).not.toHaveBeenCalledWith(
        'get_document_audit_history',
        expect.anything()
      );

      // 2. EDIT Grantee
      mockAuthorizationContext({ docOwnerId: ownerUser.id, grantPermission: 'EDIT' });
      const resultEdit = await getDocumentAuditHistory(granteeUser.id, testDocId);
      expect(resultEdit.success).toBe(false);
      expect(resultEdit.notFoundOrDenied).toBe(true);
      expect(resultEdit.error).toBe('Document not found or access denied');
    });

    it('denies unrelated user document audit history with generic notFoundOrDenied using real authorize()', async () => {
      mockAuthorizationContext({ docOwnerId: ownerUser.id, grantPermission: null });

      const mockAdminClient = {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      const result = await getDocumentAuditHistory(unrelatedUser.id, testDocId);
      expect(result.success).toBe(false);
      expect(result.notFoundOrDenied).toBe(true);
      expect(result.error).toBe('Document not found or access denied');
    });

    it('proves GET /api/documents/[id]/activity returns 404 for READ and EDIT grantees and 200 for owner using real authorize()', async () => {
      // 1. READ Grantee request -> 404
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: granteeUser.id, email: granteeUser.email } as any,
        profile: { id: granteeUser.id, role: 'VIEWER', status: 'ACTIVE' } as any,
        isActive: true,
      });

      mockAuthorizationContext({ docOwnerId: ownerUser.id, grantPermission: 'READ' });

      const reqGranteeRead = new NextRequest(
        `http://localhost/api/documents/${testDocId}/activity`
      );
      const resGranteeRead = await getDocActivityRoute(reqGranteeRead, {
        params: Promise.resolve({ id: testDocId }),
      });
      expect(resGranteeRead.status).toBe(404);
      const bodyGranteeRead = await resGranteeRead.json();
      expect(bodyGranteeRead.error).toBe('Document not found or access denied');

      // 2. EDIT Grantee request -> 404
      mockAuthorizationContext({ docOwnerId: ownerUser.id, grantPermission: 'EDIT' });
      const reqGranteeEdit = new NextRequest(
        `http://localhost/api/documents/${testDocId}/activity`
      );
      const resGranteeEdit = await getDocActivityRoute(reqGranteeEdit, {
        params: Promise.resolve({ id: testDocId }),
      });
      expect(resGranteeEdit.status).toBe(404);
      const bodyGranteeEdit = await resGranteeEdit.json();
      expect(bodyGranteeEdit.error).toBe('Document not found or access denied');

      // 3. Owner request -> 200
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: ownerUser.id, email: ownerUser.email } as any,
        profile: { id: ownerUser.id, role: 'OWNER', status: 'ACTIVE' } as any,
        isActive: true,
      });

      mockAuthorizationContext({ docOwnerId: ownerUser.id, grantPermission: null });

      const mockAdminClient = {
        rpc: vi.fn().mockImplementation((procName: string) => {
          if (procName === 'append_audit_log') {
            return Promise.resolve({
              data: [
                {
                  id: '00000000-0000-0000-0000-000000000001',
                  sequence_number: '11',
                  actor_id: ownerUser.id,
                  document_id: testDocId,
                  action: 'AUDIT_VIEW',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  prev_hash: 'prev',
                  row_hash: 'row',
                  metadata: {},
                },
              ],
              error: null,
            });
          }
          if (procName === 'get_document_audit_history') {
            return Promise.resolve({
              data: [
                {
                  sequence_number: 1,
                  actor_id: ownerUser.id,
                  document_id: testDocId,
                  action: 'DOCUMENT_CREATE',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  safe_metadata: { category: 'financial' },
                },
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      const reqOwner = new NextRequest(
        `http://localhost/api/documents/${testDocId}/activity`
      );
      const resOwner = await getDocActivityRoute(reqOwner, {
        params: Promise.resolve({ id: testDocId }),
      });
      expect(resOwner.status).toBe(200);
      const bodyOwner = await resOwner.json();
      expect(bodyOwner.success).toBe(true);
      expect(bodyOwner.activities).toHaveLength(1);
    });

    it('proves owner-wide activity route /api/activity calls real authorize() for each returned document and excludes inaccessible records', async () => {
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: ownerUser.id, email: ownerUser.email } as any,
        profile: { id: ownerUser.id, role: 'OWNER', status: 'ACTIVE' } as any,
        isActive: true,
      });

      // Context mock handles multiple documents: testDocId is owned by owner; unownedDocId is owned by someone else
      mockAuthorizationContext();

      const mockAdminClient = {
        rpc: vi.fn().mockImplementation((procName: string) => {
          if (procName === 'append_audit_log') {
            return Promise.resolve({
              data: [
                {
                  id: '00000000-0000-0000-0000-000000000001',
                  sequence_number: '12',
                  actor_id: ownerUser.id,
                  document_id: null,
                  action: 'AUDIT_VIEW',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  prev_hash: 'prev',
                  row_hash: 'row',
                  metadata: {},
                },
              ],
              error: null,
            });
          }
          if (procName === 'get_owner_audit_history') {
            return Promise.resolve({
              data: [
                {
                  sequence_number: 1,
                  actor_id: ownerUser.id,
                  document_id: testDocId, // Owned document
                  action: 'DOCUMENT_CREATE',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  safe_metadata: { category: 'legal' },
                },
                {
                  sequence_number: 2,
                  actor_id: unrelatedUser.id,
                  document_id: unownedDocId, // Inaccessible/unowned document returned by DB anomaly
                  action: 'DOCUMENT_CREATE',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  safe_metadata: { category: 'secret' },
                },
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      const req = new NextRequest('http://localhost/api/activity');
      const res = await getUserActivityRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Defense-in-depth: unownedDocId was filtered out by real authorize()
      expect(body.activities).toHaveLength(1);
      expect(body.activities[0].documentId).toBe(testDocId);
    });

    it('denies disabled user from accessing /api/activity', async () => {
      vi.spyOn(sessionModule, 'requireAuth').mockRejectedValue(
        new sessionModule.AuthenticationError(
          'Account is disabled. Access denied.',
          'ACCOUNT_DISABLED',
          disabledUser.id
        )
      );

      const req = new NextRequest(`http://localhost/api/activity?userId=${disabledUser.id}`);
      const res = await getUserActivityRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/disabled/i);
    });
  });

  // ==========================================================================
  // SECTION 3: Admin Global Activity & Chain Verification Tests
  // ==========================================================================
  describe('3. Admin Global Activity & Chain Verification Boundaries', () => {
    it('allows Admin to view global activity and denies Owner using real authorize()', async () => {
      const mockAdminClient = {
        rpc: vi.fn().mockImplementation((procName: string) => {
          if (procName === 'append_audit_log') {
            return Promise.resolve({
              data: [
                {
                  id: '00000000-0000-0000-0000-000000000001',
                  sequence_number: '12',
                  actor_id: adminUser.id,
                  document_id: null,
                  action: 'AUDIT_VIEW',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  prev_hash: 'prev',
                  row_hash: 'row',
                  metadata: {},
                },
              ],
              error: null,
            });
          }
          if (procName === 'get_admin_global_audit_activity') {
            return Promise.resolve({
              data: [
                {
                  sequence_number: 1,
                  actor_id: ownerUser.id,
                  document_id: testDocId,
                  action: 'DOCUMENT_CREATE',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  safe_metadata: {},
                },
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      // 1. Admin allowed
      mockAuthorizationContext({ role: 'ADMIN' });
      const adminResult = await getAdminGlobalAuditActivity(adminUser.id);
      expect(adminResult.success).toBe(true);
      expect(adminResult.activities).toHaveLength(1);

      // 2. Owner DENIED global activity (owners may only see documents they own)
      mockAuthorizationContext({ role: 'OWNER' });
      const ownerResult = await getAdminGlobalAuditActivity(ownerUser.id);
      expect(ownerResult.success).toBe(false);
      expect(ownerResult.forbidden).toBe(true);
      expect(ownerResult.error).toMatch(/Administrator access required/i);
    });

    it('proves GET /api/admin/activity returns 403 for Owner and 200 for Admin using real authorize()', async () => {
      const mockAdminClient = {
        rpc: vi.fn().mockImplementation((procName: string) => {
          if (procName === 'append_audit_log') {
            return Promise.resolve({
              data: [
                {
                  id: '00000000-0000-0000-0000-000000000001',
                  sequence_number: '13',
                  actor_id: adminUser.id,
                  document_id: null,
                  action: 'AUDIT_VIEW',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  prev_hash: 'prev',
                  row_hash: 'row',
                  metadata: {},
                },
              ],
              error: null,
            });
          }
          if (procName === 'get_admin_global_audit_activity') {
            return Promise.resolve({
              data: [
                {
                  sequence_number: 1,
                  actor_id: ownerUser.id,
                  document_id: testDocId,
                  action: 'DOCUMENT_CREATE',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  safe_metadata: {},
                },
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      // 1. Owner request -> 403
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: ownerUser.id, email: ownerUser.email } as any,
        profile: { id: ownerUser.id, role: 'OWNER', status: 'ACTIVE' } as any,
        isActive: true,
      });

      mockAuthorizationContext({ role: 'OWNER' });

      const reqOwner = new NextRequest('http://localhost/api/admin/activity');
      const resOwner = await getAdminActivityRoute(reqOwner);
      expect(resOwner.status).toBe(403);

      // 2. Admin request -> 200
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: adminUser.id, email: adminUser.email } as any,
        profile: { id: adminUser.id, role: 'ADMIN', status: 'ACTIVE' } as any,
        isActive: true,
      });

      mockAuthorizationContext({ role: 'ADMIN' });

      const reqAdmin = new NextRequest('http://localhost/api/admin/activity');
      const resAdmin = await getAdminActivityRoute(reqAdmin);
      expect(resAdmin.status).toBe(200);
      const bodyAdmin = await resAdmin.json();
      expect(bodyAdmin.success).toBe(true);
      expect(bodyAdmin.activities).toHaveLength(1);
    });

    it('proves GET and POST /api/admin/audit/verify return 403 for non-admin and 200 for Admin using real authorize()', async () => {
      const mockAdminClient = {
        rpc: vi.fn().mockImplementation((procName: string) => {
          if (procName === 'append_audit_log') {
            return Promise.resolve({
              data: [
                {
                  id: '00000000-0000-0000-0000-000000000001',
                  sequence_number: '14',
                  actor_id: adminUser.id,
                  document_id: null,
                  action: 'AUDIT_VERIFY',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  prev_hash: 'prev',
                  row_hash: 'row',
                  metadata: {},
                },
              ],
              error: null,
            });
          }
          if (procName === 'get_admin_audit_chain_summary') {
            return Promise.resolve({
              data: [
                {
                  total_verified: 14,
                  is_valid: true,
                  failed_at_sequence: null,
                  failure_reason: null,
                  last_verified_at: new Date().toISOString(),
                },
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      // 1. Non-admin -> 403
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: ownerUser.id, email: ownerUser.email } as any,
        profile: { id: ownerUser.id, role: 'OWNER', status: 'ACTIVE' } as any,
        isActive: true,
      });

      mockAuthorizationContext({ role: 'OWNER' });

      const reqGet = new NextRequest('http://localhost/api/admin/audit/verify');
      const resGet = await getAdminVerifyRoute(reqGet);
      expect(resGet.status).toBe(403);

      const reqPost = new NextRequest('http://localhost/api/admin/audit/verify', { method: 'POST' });
      const resPost = await postAdminVerifyRoute(reqPost);
      expect(resPost.status).toBe(403);

      // 2. Admin -> 200
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: adminUser.id, email: adminUser.email } as any,
        profile: { id: adminUser.id, role: 'ADMIN', status: 'ACTIVE' } as any,
        isActive: true,
      });

      mockAuthorizationContext({ role: 'ADMIN' });

      const resGetAdmin = await getAdminVerifyRoute(reqGet);
      expect(resGetAdmin.status).toBe(200);
      const bodyGetAdmin = await resGetAdmin.json();
      expect(bodyGetAdmin.success).toBe(true);
      expect(bodyGetAdmin.verification.isValid).toBe(true);
      expect(bodyGetAdmin.verification.totalVerified).toBe(14);
    });
  });

  // ==========================================================================
  // SECTION 4: Fail-Closed Logging & Safe Projection Guarantees
  // ==========================================================================
  describe('4. Fail-Closed Logging & Safe Projection Guarantees', () => {
    it('aborts and throws AuditLoggingError if mandatory AUDIT_VIEW event fails to commit', async () => {
      mockAuthorizationContext({ docOwnerId: ownerUser.id });

      const mockAdminClient = {
        rpc: vi.fn().mockImplementation((procName: string) => {
          if (procName === 'append_audit_log') {
            return Promise.resolve({
              data: null,
              error: { message: 'Lock acquisition timeout in pg_advisory_xact_lock' },
            });
          }
          return Promise.resolve({ data: [], error: null });
        }),
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      await expect(getDocumentAuditHistory(ownerUser.id, testDocId)).rejects.toThrow(
        AuditLoggingError
      );
      // Ensure read query procedure is never invoked when audit log fails
      expect(mockAdminClient.rpc).not.toHaveBeenCalledWith(
        'get_document_audit_history',
        expect.anything()
      );
    });

    it('ensures safe metadata projection does not expose raw IP, user agent, prev_hash, or row_hash', async () => {
      mockAuthorizationContext({ role: 'ADMIN' });

      const mockAdminClient = {
        rpc: vi.fn().mockImplementation((procName: string) => {
          if (procName === 'append_audit_log') {
            return Promise.resolve({
              data: [
                {
                  id: '00000000-0000-0000-0000-000000000001',
                  sequence_number: '15',
                  actor_id: adminUser.id,
                  document_id: null,
                  action: 'AUDIT_VIEW',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  prev_hash: 'secret_prev_hash',
                  row_hash: 'secret_row_hash',
                  metadata: {},
                },
              ],
              error: null,
            });
          }
          if (procName === 'get_admin_global_audit_activity') {
            return Promise.resolve({
              data: [
                {
                  sequence_number: 1,
                  actor_id: ownerUser.id,
                  document_id: testDocId,
                  action: 'DOCUMENT_CREATE',
                  result: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                  safe_metadata: { category: 'financial' },
                },
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      const result = await getAdminGlobalAuditActivity(adminUser.id);
      expect(result.success).toBe(true);
      const item = result.activities![0];

      // Verifying strict projection:
      expect(item).toHaveProperty('sequenceNumber');
      expect(item).toHaveProperty('actorId');
      expect(item).toHaveProperty('documentId');
      expect(item).toHaveProperty('action');
      expect(item).toHaveProperty('result');
      expect(item).toHaveProperty('timestamp');
      expect(item).toHaveProperty('metadata');

      // Verifying that sensitive internal columns are NOT in the projected SafeAuditRecord:
      expect((item as any).prev_hash).toBeUndefined();
      expect((item as any).prevHash).toBeUndefined();
      expect((item as any).row_hash).toBeUndefined();
      expect((item as any).rowHash).toBeUndefined();
      expect((item as any).ip_address).toBeUndefined();
      expect((item as any).ipAddress).toBeUndefined();
      expect((item as any).user_agent).toBeUndefined();
      expect((item as any).userAgent).toBeUndefined();
    });
  });
});
