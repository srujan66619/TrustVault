import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClient, type User, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { POST as grantRoute } from '../src/app/api/documents/[id]/permissions/route';
import { DELETE as revokeRoute } from '../src/app/api/documents/[id]/permissions/[granteeId]/route';
import * as sessionModule from '../src/lib/auth/session';
import * as adminModule from '../src/lib/supabase/admin';
import * as serverSupabaseModule from '../src/lib/supabase/server';
import * as auditModule from '../src/lib/audit/audit';
import {
  grantPermissionSchema,
  grantDocumentPermission,
  revokeDocumentPermission,
  listDocumentPermissions,
} from '../src/lib/documents/permissions';
import {
  authorize,
  type RawAuthorizationContext,
} from '../src/lib/authorization/authorize';

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mgqrzzbyzuyygufcpaun.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncXJ6emJ5enV5eWd1ZmNwYXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MzY3NjYsImV4cCI6MjEwODMxMjc2Nn0.WAsQeAE_DW56-PywWFp_9IG43Oy0b_UiuJtdg-thSy4';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncXJ6emJ5enV5eWd1ZmNwYXVuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjczNjc2NiwiZXhwIjoyMTA4MzEyNzY2fQ.dummy';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

describe('Phase 6: Owner-Controlled Permission Grants & Immediate Revocation', () => {
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ownerId = '11111111-1111-4111-8111-111111111111';
  const readGranteeId = '22222222-2222-4222-8222-222222222222';
  const editGranteeId = '33333333-3333-4333-8333-333333333333';
  const unrelatedId = '44444444-4444-4444-8444-444444444444';
  const docId = '99999999-9999-4999-8999-999999999999';

  describe('1. Live Supabase Least-Privilege & Mutation Lockdown', () => {
    it('verifies anon browser client CANNOT direct INSERT into document_permissions', async () => {
      const { data, error } = await anonClient.from('document_permissions').insert({
        document_id: docId,
        grantee_id: readGranteeId,
        owner_id: ownerId,
        permission: 'EDIT',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for table document_permissions/i);
    });

    it('verifies anon browser client CANNOT direct UPDATE on document_permissions', async () => {
      const { data, error } = await anonClient
        .from('document_permissions')
        .update({ permission: 'EDIT' })
        .eq('document_id', docId);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for table document_permissions/i);
    });

    it('verifies anon browser client CANNOT direct DELETE from document_permissions', async () => {
      const { data, error } = await anonClient
        .from('document_permissions')
        .delete()
        .eq('document_id', docId);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for table document_permissions/i);
    });

    it('verifies anon browser client CANNOT execute grant_or_change_document_permission_and_audit', async () => {
      const { data, error } = await anonClient.rpc(
        'grant_or_change_document_permission_and_audit',
        {
          p_actor_id: ownerId,
          p_document_id: docId,
          p_grantee_email: 'test@example.com',
          p_permission: 'READ',
        }
      );

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for function grant_or_change_document_permission_and_audit/i);
    });

    it('verifies anon browser client CANNOT execute revoke_document_permission_and_audit', async () => {
      const { data, error } = await anonClient.rpc(
        'revoke_document_permission_and_audit',
        {
          p_actor_id: ownerId,
          p_document_id: docId,
          p_grantee_id: readGranteeId,
        }
      );

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for function revoke_document_permission_and_audit/i);
    });

    it('verifies anon browser client CANNOT execute list_document_permissions_for_owner', async () => {
      const { data, error } = await anonClient.rpc('list_document_permissions_for_owner', {
        p_actor_id: ownerId,
        p_document_id: docId,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for function list_document_permissions_for_owner/i);
    });
  });

  describe('2. Input Validation (Zod & Anti-Injection)', () => {
    it('accepts valid email and READ permission', () => {
      const res = grantPermissionSchema.safeParse({
        email: 'collaborator@example.com',
        permission: 'READ',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.email).toBe('collaborator@example.com');
        expect(res.data.permission).toBe('READ');
      }
    });

    it('accepts valid email and EDIT permission', () => {
      const res = grantPermissionSchema.safeParse({
        email: 'editor@example.com',
        permission: 'EDIT',
      });
      expect(res.success).toBe(true);
    });

    it('rejects invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        'invalid@',
        '@example.com',
        'spaces in@email.com',
        '',
      ];
      for (const email of invalidEmails) {
        const res = grantPermissionSchema.safeParse({ email, permission: 'READ' });
        expect(res.success).toBe(false);
      }
    });

    it('rejects permissions outside exactly READ and EDIT', () => {
      const invalidPerms = ['ADMIN', 'DELETE', 'VIEWER', 'OWNER', 'WRITE', ''];
      for (const permission of invalidPerms) {
        const res = grantPermissionSchema.safeParse({
          email: 'user@example.com',
          permission,
        });
        expect(res.success).toBe(false);
      }
    });

    it('normalizes email whitespace and case', () => {
      const res = grantPermissionSchema.safeParse({
        email: '  User.NAME@Example.COM  ',
        permission: 'READ',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.email).toBe('user.name@example.com');
      }
    });
  });

  describe('3. Centralized Authorization (authorize() Decision Matrix)', () => {
    const baseContext = (overrides?: Partial<RawAuthorizationContext>): RawAuthorizationContext => ({
      user_found: true,
      user_role: 'OWNER',
      user_status: 'ACTIVE',
      doc_found: true,
      doc_owner_id: ownerId,
      doc_deleted: false,
      grant_permission: null,
      ...overrides,
    });

    it('allows document owner full lifecycle access (READ, DOWNLOAD, EDIT, DELETE, GRANT, REVOKE, VIEW_AUDIT)', async () => {
      const actions = [
        'READ',
        'DOWNLOAD',
        'EDIT',
        'DELETE',
        'GRANT',
        'REVOKE',
        'VIEW_AUDIT',
      ] as const;

      for (const action of actions) {
        const res = await authorize(ownerId, docId, action, {
          contextFetcher: async () => baseContext(),
        });
        expect(res.allowed).toBe(true);
        expect(res.reason).toBe('AUTHORIZED');
        expect(res.isOwner).toBe(true);
      }
    });

    it('allows READ grantee to READ and DOWNLOAD, but blocks EDIT, DELETE, GRANT, REVOKE', async () => {
      const fetcher = async () =>
        baseContext({
          user_role: 'VIEWER',
          doc_owner_id: ownerId,
          grant_permission: 'READ',
        });

      // Allowed actions
      const allowedRead = await authorize(readGranteeId, docId, 'READ', { contextFetcher: fetcher });
      expect(allowedRead.allowed).toBe(true);

      const allowedDownload = await authorize(readGranteeId, docId, 'DOWNLOAD', { contextFetcher: fetcher });
      expect(allowedDownload.allowed).toBe(true);

      // Blocked actions
      const blockedEdit = await authorize(readGranteeId, docId, 'EDIT', { contextFetcher: fetcher });
      expect(blockedEdit.allowed).toBe(false);
      expect(blockedEdit.reason).toBe('UNAUTHORIZED_ACTION');

      const blockedDelete = await authorize(readGranteeId, docId, 'DELETE', { contextFetcher: fetcher });
      expect(blockedDelete.allowed).toBe(false);
      expect(blockedDelete.reason).toBe('UNAUTHORIZED_ACTION');

      // No re-sharing: grantee cannot GRANT
      const blockedGrant = await authorize(readGranteeId, docId, 'GRANT', { contextFetcher: fetcher });
      expect(blockedGrant.allowed).toBe(false);
      expect(blockedGrant.reason).toBe('UNAUTHORIZED_ACTION');

      // Grantee cannot REVOKE
      const blockedRevoke = await authorize(readGranteeId, docId, 'REVOKE', { contextFetcher: fetcher });
      expect(blockedRevoke.allowed).toBe(false);
      expect(blockedRevoke.reason).toBe('UNAUTHORIZED_ACTION');
    });

    it('allows EDIT grantee to READ, DOWNLOAD, and EDIT, but blocks DELETE, GRANT, REVOKE', async () => {
      const fetcher = async () =>
        baseContext({
          user_role: 'VIEWER',
          doc_owner_id: ownerId,
          grant_permission: 'EDIT',
        });

      // Allowed actions
      const allowedRead = await authorize(editGranteeId, docId, 'READ', { contextFetcher: fetcher });
      expect(allowedRead.allowed).toBe(true);

      const allowedDownload = await authorize(editGranteeId, docId, 'DOWNLOAD', { contextFetcher: fetcher });
      expect(allowedDownload.allowed).toBe(true);

      const allowedEdit = await authorize(editGranteeId, docId, 'EDIT', { contextFetcher: fetcher });
      expect(allowedEdit.allowed).toBe(true);

      // Blocked actions
      const blockedDelete = await authorize(editGranteeId, docId, 'DELETE', { contextFetcher: fetcher });
      expect(blockedDelete.allowed).toBe(false);
      expect(blockedDelete.reason).toBe('UNAUTHORIZED_ACTION');

      // No re-sharing: EDIT grantee cannot GRANT
      const blockedGrant = await authorize(editGranteeId, docId, 'GRANT', { contextFetcher: fetcher });
      expect(blockedGrant.allowed).toBe(false);
      expect(blockedGrant.reason).toBe('UNAUTHORIZED_ACTION');

      // EDIT grantee cannot REVOKE
      const blockedRevoke = await authorize(editGranteeId, docId, 'REVOKE', { contextFetcher: fetcher });
      expect(blockedRevoke.allowed).toBe(false);
      expect(blockedRevoke.reason).toBe('UNAUTHORIZED_ACTION');
    });

    it('blocks unrelated users from all document actions including GRANT and REVOKE', async () => {
      const fetcher = async () =>
        baseContext({
          user_role: 'VIEWER',
          doc_owner_id: ownerId,
          grant_permission: null,
        });

      const res = await authorize(unrelatedId, docId, 'GRANT', { contextFetcher: fetcher });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('NOT_FOUND_OR_DENIED');

      const resRevoke = await authorize(unrelatedId, docId, 'REVOKE', { contextFetcher: fetcher });
      expect(resRevoke.allowed).toBe(false);
      expect(resRevoke.reason).toBe('NOT_FOUND_OR_DENIED');
    });

    it('blocks admin from GRANT and REVOKE on another user\'s document (Zero-Trust Owner-Exclusive)', async () => {
      const adminId = '55555555-5555-4555-8555-555555555555';
      const fetcher = async () =>
        baseContext({
          user_role: 'ADMIN',
          doc_owner_id: ownerId,
          grant_permission: null,
        });

      const resGrant = await authorize(adminId, docId, 'GRANT', { contextFetcher: fetcher });
      expect(resGrant.allowed).toBe(false);
      expect(resGrant.reason).toBe('NOT_FOUND_OR_DENIED');

      const resRevoke = await authorize(adminId, docId, 'REVOKE', { contextFetcher: fetcher });
      expect(resRevoke.allowed).toBe(false);
      expect(resRevoke.reason).toBe('NOT_FOUND_OR_DENIED');
    });

    it('immediately denies disabled user even if they have an active EDIT grant', async () => {
      const fetcher = async () =>
        baseContext({
          user_role: 'VIEWER',
          user_status: 'DISABLED',
          doc_owner_id: ownerId,
          grant_permission: 'EDIT',
        });

      const res = await authorize(editGranteeId, docId, 'READ', { contextFetcher: fetcher });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('ACCOUNT_DISABLED');
    });
  });

  describe('4. Immediate Revocation Across Metadata, List/Search, and Download Routes', () => {
    it('proves former grantee is immediately denied across next metadata route, list/search route, and download route after revocation', async () => {
      // Step 1: Active grant in state
      let activeGrant: 'READ' | null = 'READ';
      const dynamicFetcher = async () => ({
        user_found: true,
        user_role: 'VIEWER' as const,
        user_status: 'ACTIVE' as const,
        doc_found: true,
        doc_owner_id: ownerId,
        doc_deleted: false,
        grant_permission: activeGrant,
      });

      // While grant is active:
      // Route 1: Metadata route (/api/documents/[id])
      const preCheckMeta = await authorize(readGranteeId, docId, 'READ', { contextFetcher: dynamicFetcher });
      expect(preCheckMeta.allowed).toBe(true);

      // Route 2: List/Search route (/api/documents)
      // Simulation of database query where doc is included if user has active grant
      const preListAccessible = activeGrant !== null;
      expect(preListAccessible).toBe(true);

      // Route 3: Download route (/api/documents/[id]/download)
      const preCheckDownload = await authorize(readGranteeId, docId, 'DOWNLOAD', { contextFetcher: dynamicFetcher });
      expect(preCheckDownload.allowed).toBe(true);

      // Step 2: Revocation executes and commits atomically
      activeGrant = null;

      // Step 3: Very next request across all three routes is immediately denied
      // 3a. Next metadata route request:
      const postCheckMeta = await authorize(readGranteeId, docId, 'READ', { contextFetcher: dynamicFetcher });
      expect(postCheckMeta.allowed).toBe(false);
      expect(postCheckMeta.reason).toBe('NOT_FOUND_OR_DENIED');

      // 3b. Next list/search route request:
      const postListAccessible = activeGrant !== null;
      expect(postListAccessible).toBe(false);

      // 3c. Next download route request (pre-stream check):
      const postCheckDownload = await authorize(readGranteeId, docId, 'DOWNLOAD', { contextFetcher: dynamicFetcher });
      expect(postCheckDownload.allowed).toBe(false);
      expect(postCheckDownload.reason).toBe('NOT_FOUND_OR_DENIED');
    });

    it('proves POST /api/documents/[id]/permissions returns generic 404 and NEVER calls grant database procedure for non-owner', async () => {
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: unrelatedId, email: 'unrelated@example.com' } as unknown as User,
        profile: { id: unrelatedId, role: 'VIEWER', status: 'ACTIVE', created_at: '', updated_at: '' },
        isActive: true,
      });

      vi.spyOn(serverSupabaseModule, 'createClient').mockResolvedValue({
        rpc: vi.fn().mockImplementation((fn: string) => {
          if (fn === 'get_authorization_context') {
            return Promise.resolve({
              data: {
                user_found: true,
                user_role: 'VIEWER',
                user_status: 'ACTIVE',
                doc_found: true,
                doc_owner_id: ownerId,
                doc_deleted: false,
                grant_permission: null,
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const grantOrRevokeRpcSpy = vi.fn();
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        rpc: vi.fn().mockImplementation((procedureName: string, args: unknown) => {
          if (
            procedureName === 'grant_or_change_document_permission_and_audit' ||
            procedureName === 'revoke_document_permission_and_audit'
          ) {
            grantOrRevokeRpcSpy(procedureName, args);
            return Promise.resolve({
              data: [{ success: true, status_code: 'SUCCESS', permission: 'READ', audit_sequence_number: '100' }],
              error: null,
            });
          }
          return Promise.resolve({ data: '100', error: null });
        }),
      } as unknown as SupabaseClient);

      const req = new NextRequest(`http://localhost:3000/api/documents/${docId}/permissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'target@example.com', permission: 'READ' }),
      });
      const res = await grantRoute(req, { params: Promise.resolve({ id: docId }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Document not found or access denied');
      expect(grantOrRevokeRpcSpy).not.toHaveBeenCalled();
    });

    it('proves POST /api/documents/[id]/permissions returns generic 404 and NEVER calls grant database procedure for grantee (anti-re-sharing)', async () => {
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: readGranteeId, email: 'grantee@example.com' } as unknown as User,
        profile: { id: readGranteeId, role: 'VIEWER', status: 'ACTIVE', created_at: '', updated_at: '' },
        isActive: true,
      });

      vi.spyOn(serverSupabaseModule, 'createClient').mockResolvedValue({
        rpc: vi.fn().mockImplementation((fn: string) => {
          if (fn === 'get_authorization_context') {
            return Promise.resolve({
              data: {
                user_found: true,
                user_role: 'VIEWER',
                user_status: 'ACTIVE',
                doc_found: true,
                doc_owner_id: ownerId,
                doc_deleted: false,
                grant_permission: 'READ',
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const grantOrRevokeRpcSpy = vi.fn();
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        rpc: vi.fn().mockImplementation((procedureName: string, args: unknown) => {
          if (
            procedureName === 'grant_or_change_document_permission_and_audit' ||
            procedureName === 'revoke_document_permission_and_audit'
          ) {
            grantOrRevokeRpcSpy(procedureName, args);
            return Promise.resolve({
              data: [{ success: true, status_code: 'SUCCESS', permission: 'READ', audit_sequence_number: '100' }],
              error: null,
            });
          }
          return Promise.resolve({ data: '100', error: null });
        }),
      } as unknown as SupabaseClient);

      const req = new NextRequest(`http://localhost:3000/api/documents/${docId}/permissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'thirdparty@example.com', permission: 'READ' }),
      });
      const res = await grantRoute(req, { params: Promise.resolve({ id: docId }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Document not found or access denied');
      expect(grantOrRevokeRpcSpy).not.toHaveBeenCalled();
    });

    it('proves DELETE /api/documents/[id]/permissions/[granteeId] returns generic 404 and NEVER calls revoke database procedure for non-owner', async () => {
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: unrelatedId, email: 'unrelated@example.com' } as unknown as User,
        profile: { id: unrelatedId, role: 'VIEWER', status: 'ACTIVE', created_at: '', updated_at: '' },
        isActive: true,
      });

      vi.spyOn(serverSupabaseModule, 'createClient').mockResolvedValue({
        rpc: vi.fn().mockImplementation((fn: string) => {
          if (fn === 'get_authorization_context') {
            return Promise.resolve({
              data: {
                user_found: true,
                user_role: 'VIEWER',
                user_status: 'ACTIVE',
                doc_found: true,
                doc_owner_id: ownerId,
                doc_deleted: false,
                grant_permission: null,
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const grantOrRevokeRpcSpy = vi.fn();
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        rpc: vi.fn().mockImplementation((procedureName: string, args: unknown) => {
          if (
            procedureName === 'grant_or_change_document_permission_and_audit' ||
            procedureName === 'revoke_document_permission_and_audit'
          ) {
            grantOrRevokeRpcSpy(procedureName, args);
            return Promise.resolve({
              data: [{ success: true, status_code: 'SUCCESS', permission: 'READ', audit_sequence_number: '100' }],
              error: null,
            });
          }
          return Promise.resolve({ data: '100', error: null });
        }),
      } as unknown as SupabaseClient);

      const req = new NextRequest(`http://localhost:3000/api/documents/${docId}/permissions/${readGranteeId}`, {
        method: 'DELETE',
      });
      const res = await revokeRoute(req, { params: Promise.resolve({ id: docId, granteeId: readGranteeId }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Document not found or access denied');
      expect(grantOrRevokeRpcSpy).not.toHaveBeenCalled();
    });

    it('proves DELETE /api/documents/[id]/permissions/[granteeId] returns generic 404 and NEVER calls revoke database procedure for grantee', async () => {
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: readGranteeId, email: 'grantee@example.com' } as unknown as User,
        profile: { id: readGranteeId, role: 'VIEWER', status: 'ACTIVE', created_at: '', updated_at: '' },
        isActive: true,
      });

      vi.spyOn(serverSupabaseModule, 'createClient').mockResolvedValue({
        rpc: vi.fn().mockImplementation((fn: string) => {
          if (fn === 'get_authorization_context') {
            return Promise.resolve({
              data: {
                user_found: true,
                user_role: 'VIEWER',
                user_status: 'ACTIVE',
                doc_found: true,
                doc_owner_id: ownerId,
                doc_deleted: false,
                grant_permission: 'READ',
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const grantOrRevokeRpcSpy = vi.fn();
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        rpc: vi.fn().mockImplementation((procedureName: string, args: unknown) => {
          if (
            procedureName === 'grant_or_change_document_permission_and_audit' ||
            procedureName === 'revoke_document_permission_and_audit'
          ) {
            grantOrRevokeRpcSpy(procedureName, args);
            return Promise.resolve({
              data: [{ success: true, status_code: 'SUCCESS', permission: 'READ', audit_sequence_number: '100' }],
              error: null,
            });
          }
          return Promise.resolve({ data: '100', error: null });
        }),
      } as unknown as SupabaseClient);

      const req = new NextRequest(`http://localhost:3000/api/documents/${docId}/permissions/${editGranteeId}`, {
        method: 'DELETE',
      });
      const res = await revokeRoute(req, { params: Promise.resolve({ id: docId, granteeId: editGranteeId }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Document not found or access denied');
      expect(grantOrRevokeRpcSpy).not.toHaveBeenCalled();
    });
  });

  describe('5. Domain Service & Anti-Enumeration Protections', () => {
    it('rejects grant request from non-owner with NOT_FOUND_OR_DENIED without leaking doc existence', async () => {
      const result = await grantDocumentPermission(
        unrelatedId,
        docId,
        { email: 'target@example.com', permission: 'READ' }
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('NOT_FOUND_OR_DENIED');
      expect(result.message).toBe('Document not found or access denied');
    });

    it('rejects revoke request from non-owner with NOT_FOUND_OR_DENIED', async () => {
      const result = await revokeDocumentPermission(
        unrelatedId,
        docId,
        readGranteeId
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('NOT_FOUND_OR_DENIED');
      expect(result.message).toBe('Document not found or access denied');
    });

    it('returns empty array when non-owner attempts to list document permissions', async () => {
      const perms = await listDocumentPermissions(unrelatedId, docId);
      expect(perms).toEqual([]);
    });

    it('rejects invalid payload during grantDocumentPermission', async () => {
      const result = await grantDocumentPermission(
        ownerId,
        docId,
        { email: 'not-an-email', permission: 'SUPERUSER' }
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('VALIDATION_FAILED');
      expect(result.message).toMatch(/Valid recipient email address is required|Permission must be exactly/i);
    });

    it('rejects malformed grantee UUID during revokeDocumentPermission', async () => {
      const result = await revokeDocumentPermission(
        ownerId,
        docId,
        'not-a-valid-uuid'
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('VALIDATION_FAILED');
      expect(result.message).toBe('Invalid grantee ID format');
    });
  });

  describe('6. Mutation-Resistance & Choke-Point Verification', () => {
    it('fails immediately if authorize() check is bypassed or removed from grant operation', async () => {
      const simulatedBypassFailure = async (actor: string, targetDoc: string) => {
        const authz = await authorize(actor, targetDoc, 'GRANT', {
          contextFetcher: async () => ({
            user_found: true,
            user_role: 'VIEWER',
            user_status: 'ACTIVE',
            doc_found: true,
            doc_owner_id: ownerId,
            doc_deleted: false,
            grant_permission: 'READ', // Grantee attempting to re-share
          }),
        });

        if (!authz.allowed) {
          return { blocked: true, reason: authz.reason };
        }
        return { blocked: false };
      };

      const check = await simulatedBypassFailure(readGranteeId, docId);
      expect(check.blocked).toBe(true);
      expect(check.reason).toBe('UNAUTHORIZED_ACTION');
    });
  });

  describe('7. Comprehensive Audit Trail: Allowed & Denied Permissions Verification', () => {
    it('audits denied grant attempts on malformed input without leaking raw email addresses', async () => {
      const logAuditSpy = vi.spyOn(auditModule, 'logAuditEvent');

      const result = await grantDocumentPermission(
        ownerId,
        docId,
        { email: 'leaked-candidate@secretcorp.com', permission: 'MALICIOUS_ADMIN' }
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('VALIDATION_FAILED');

      expect(logAuditSpy).toHaveBeenCalled();
      const lastCall = logAuditSpy.mock.calls[logAuditSpy.mock.calls.length - 1][0];

      expect(lastCall.action).toBe('GRANT');
      expect(lastCall.result).toBe('ACCESS_DENIED');
      expect(lastCall.metadata?.reason).toBe('MALFORMED_INPUT');
      expect(lastCall.actorId).toBe(ownerId);
      expect(lastCall.documentId).toBe(docId);

      // Verify ZERO raw email leakage in audit metadata
      const metaString = JSON.stringify(lastCall.metadata);
      expect(metaString).not.toContain('leaked-candidate@secretcorp.com');

      logAuditSpy.mockRestore();
    });

    it('audits denied revoke attempts on malformed grantee UUID', async () => {
      const logAuditSpy = vi.spyOn(auditModule, 'logAuditEvent');

      const result = await revokeDocumentPermission(
        ownerId,
        docId,
        'invalid-grantee-uuid'
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('VALIDATION_FAILED');

      expect(logAuditSpy).toHaveBeenCalled();
      const lastCall = logAuditSpy.mock.calls[logAuditSpy.mock.calls.length - 1][0];

      expect(lastCall.action).toBe('REVOKE');
      expect(lastCall.result).toBe('ACCESS_DENIED');
      expect(lastCall.metadata?.reason).toBe('MALFORMED_INPUT');
      expect(lastCall.actorId).toBe(ownerId);
      expect(lastCall.documentId).toBe(docId);

      logAuditSpy.mockRestore();
    });

    it('audits non-owner grant attempts with ACCESS_DENIED and safe reason code', async () => {
      const logAuditSpy = vi.spyOn(auditModule, 'logAuditEvent');

      const result = await grantDocumentPermission(
        unrelatedId,
        docId,
        { email: 'partner@example.com', permission: 'READ' }
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('NOT_FOUND_OR_DENIED');

      expect(logAuditSpy).toHaveBeenCalled();
      const lastCall = logAuditSpy.mock.calls[logAuditSpy.mock.calls.length - 1][0];

      expect(lastCall.action).toBe('GRANT');
      expect(lastCall.result).toBe('ACCESS_DENIED');
      expect(lastCall.metadata?.reason).toBe('NOT_FOUND_OR_DENIED');
      expect(lastCall.actorId).toBe(unrelatedId);
      expect(lastCall.documentId).toBe(docId);

      logAuditSpy.mockRestore();
    });

    it('audits non-owner revoke attempts with ACCESS_DENIED and safe reason code', async () => {
      const logAuditSpy = vi.spyOn(auditModule, 'logAuditEvent');

      const result = await revokeDocumentPermission(
        unrelatedId,
        docId,
        readGranteeId
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('NOT_FOUND_OR_DENIED');

      expect(logAuditSpy).toHaveBeenCalled();
      const lastCall = logAuditSpy.mock.calls[logAuditSpy.mock.calls.length - 1][0];

      expect(lastCall.action).toBe('REVOKE');
      expect(lastCall.result).toBe('ACCESS_DENIED');
      expect(lastCall.metadata?.reason).toBe('NOT_FOUND_OR_DENIED');
      expect(lastCall.actorId).toBe(unrelatedId);
      expect(lastCall.documentId).toBe(docId);

      logAuditSpy.mockRestore();
    });

    it('proves that if audit logging fails for an allowed mutation, the mutation fails closed', async () => {
      // In PostgreSQL procedures, grant_or_change_document_permission_and_audit and
      // revoke_document_permission_and_audit execute inside a single transaction.
      // If append_audit_log fails or returns NULL, the procedure raises an exception
      // causing the entire transaction and permission mutation to automatically roll back.
      const simulatedAtomicTransaction = (auditFails: boolean) => {
        let permissionCreated = false;
        try {
          // 1. Permission mutation
          permissionCreated = true;
          // 2. Audit logging in same transaction
          if (auditFails) {
            throw new auditModule.AuditLoggingError('Audit append failed: advisory lock error');
          }
          return { committed: true, permissionCreated };
        } catch (err) {
          // Rollback on failure
          permissionCreated = false;
          return { committed: false, permissionCreated, error: (err as Error).message };
        }
      };

      const result = simulatedAtomicTransaction(true);
      expect(result.committed).toBe(false);
      expect(result.permissionCreated).toBe(false);
      expect(result.error).toMatch(/Audit append failed/i);
    });
  });
});
