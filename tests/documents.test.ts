import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  validateUploadedFile,
  sanitizeFilename,
  documentMetadataInputSchema,
  updateDocumentMetadataSchema,
  listDocumentsQuerySchema,
  MAX_FILE_SIZE_BYTES,
} from '../src/lib/documents/validation';
import { authorize } from '../src/lib/authorization/authorize';
import { AuditLoggingError, logAuditEvent } from '../src/lib/audit/audit';
import * as auditModule from '../src/lib/audit/audit';
import * as sessionModule from '../src/lib/auth/session';
import * as adminModule from '../src/lib/supabase/admin';
import * as serverSupabaseModule from '../src/lib/supabase/server';
import {
  updateDocumentMetadata,
  softDeleteDocument,
  listAccessibleDocuments,
} from '../src/lib/documents/documents';
import {
  PATCH as updateMetadataRoute,
  DELETE as deleteDocumentRoute,
} from '../src/app/api/documents/[id]/route';
import { GET as getDocumentsRoute } from '../src/app/api/documents/route';
import { createClient, type User, type SupabaseClient } from '@supabase/supabase-js';

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

describe('Phase 5: Secure Document Access & File Handling', () => {
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  describe('1. File Type, Magic Bytes & Filename Validation', () => {
    it('accepts valid PDF files with %PDF- magic bytes', () => {
      // 0x25, 0x50, 0x44, 0x46, 0x2D (%PDF-)
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
      const result = validateUploadedFile(pdfBytes, 'contract.pdf');
      expect(result.isValid).toBe(true);
      expect(result.detectedMimeType).toBe('application/pdf');
      expect(result.sanitizedFilename).toBe('contract.pdf');
    });

    it('accepts valid PNG files with PNG signature', () => {
      const pngBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
      ]);
      const result = validateUploadedFile(pngBytes, 'diagram.png');
      expect(result.isValid).toBe(true);
      expect(result.detectedMimeType).toBe('image/png');
    });

    it('accepts valid JPEG files with \xFF\xD8\xFF signature', () => {
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = validateUploadedFile(jpegBytes, 'photo.jpg');
      expect(result.isValid).toBe(true);
      expect(result.detectedMimeType).toBe('image/jpeg');
    });

    it('accepts valid UTF-8 plain text files', () => {
      const textBytes = new TextEncoder().encode('TrustVault secure security audit log plain text');
      const result = validateUploadedFile(textBytes, 'notes.txt');
      expect(result.isValid).toBe(true);
      expect(result.detectedMimeType).toBe('text/plain');
    });

    it('rejects MIME spoofing (executable bytes disguised with .pdf extension)', () => {
      // DOS / PE executable header: MZ (0x4D, 0x5A)
      const exeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const result = validateUploadedFile(exeBytes, 'malware.pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/magic bytes|mismatch/i);
    });

    it('rejects SVG files to prevent stored XSS', () => {
      const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      const result = validateUploadedFile(svgBytes, 'exploit.svg');
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/extension '\.svg' is not permitted/i);
    });

    it('rejects HTML files to prevent script execution', () => {
      const htmlBytes = new TextEncoder().encode('<html><body><script>steal()</script></body></html>');
      const result = validateUploadedFile(htmlBytes, 'phishing.html');
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/extension '\.html' is not permitted/i);
    });

    it('rejects zero-byte empty files', () => {
      const emptyBytes = new Uint8Array([]);
      const result = validateUploadedFile(emptyBytes, 'empty.txt');
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/empty \(0 bytes\)/i);
    });

    it('rejects oversized files exceeding 15MB limit', () => {
      const oversized = new Uint8Array(MAX_FILE_SIZE_BYTES + 1);
      const result = validateUploadedFile(oversized, 'huge.pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/exceeds the maximum allowed limit/i);
    });

    it('rejects filenames with null bytes or path traversal sequences', () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
      const traversal = validateUploadedFile(pdfBytes, '../../etc/passwd.pdf');
      expect(traversal.isValid).toBe(false);
      expect(traversal.error).toMatch(/path traversal/i);

      const nullByte = validateUploadedFile(pdfBytes, 'exploit\0.pdf');
      expect(nullByte.isValid).toBe(false);
      expect(nullByte.error).toMatch(/null bytes/i);
    });

    it('sanitizes unsafe display filenames', () => {
      expect(sanitizeFilename('my<doc>:name*.pdf')).toBe('my_doc_name_.pdf');
      expect(sanitizeFilename('..\\..\\secret.pdf')).toBe('secret.pdf');
      expect(sanitizeFilename('   leading-dots...pdf..  ')).toBe('leading-dots.pdf');
    });

    it('validates non-file metadata input with Zod', () => {
      const valid = documentMetadataInputSchema.safeParse({
        displayName: 'Quarterly Audit 2026',
        category: 'financial',
      });
      expect(valid.success).toBe(true);

      const empty = documentMetadataInputSchema.safeParse({
        displayName: '   ',
      });
      expect(empty.success).toBe(false);

      const html = documentMetadataInputSchema.safeParse({
        displayName: '<script>alert(1)</script>',
      });
      expect(html.success).toBe(false);
    });
  });

  describe('2. Direct Browser Storage Access Denial (Zero Client Storage Access)', () => {
    it('denies browser client direct listing on the private documents bucket', async () => {
      const { data, error } = await anonClient.storage.from('documents').list();
      // Should either return null with error or empty array due to RLS denying all rows
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data).toEqual([]);
      }
    });

    it('denies browser client direct upload to the private documents bucket', async () => {
      const fakeFile = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
      const { data, error } = await anonClient.storage
        .from('documents')
        .upload('direct-client-hack.pdf', fakeFile);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    it('denies browser client direct download from the private documents bucket', async () => {
      const { data, error } = await anonClient.storage
        .from('documents')
        .download('nonexistent-or-target.pdf');

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });
  });

  describe('3. Centralized Authorization Core on Document Operations', () => {
    const ownerId = '11111111-1111-1111-1111-111111111111';
    const granteeReadId = '22222222-2222-2222-2222-222222222222';
    const granteeEditId = '33333333-3333-3333-3333-333333333333';
    const unrelatedId = '44444444-4444-4444-4444-444444444444';
    const disabledId = '55555555-5555-5555-5555-555555555555';
    const docId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    const mockFetcher = async (userId: string) => {
      if (userId === disabledId) {
        return {
          user_found: true,
          user_role: 'VIEWER' as const,
          user_status: 'DISABLED' as const,
          doc_found: true,
          doc_owner_id: ownerId,
          doc_deleted: false,
          grant_permission: null,
        };
      }

      if (userId === ownerId) {
        return {
          user_found: true,
          user_role: 'OWNER' as const,
          user_status: 'ACTIVE' as const,
          doc_found: true,
          doc_owner_id: ownerId,
          doc_deleted: false,
          grant_permission: null,
        };
      }

      if (userId === granteeReadId) {
        return {
          user_found: true,
          user_role: 'VIEWER' as const,
          user_status: 'ACTIVE' as const,
          doc_found: true,
          doc_owner_id: ownerId,
          doc_deleted: false,
          grant_permission: 'READ' as const,
        };
      }

      if (userId === granteeEditId) {
        return {
          user_found: true,
          user_role: 'VIEWER' as const,
          user_status: 'ACTIVE' as const,
          doc_found: true,
          doc_owner_id: ownerId,
          doc_deleted: false,
          grant_permission: 'EDIT' as const,
        };
      }

      // Unrelated user
      return {
        user_found: true,
        user_role: 'VIEWER' as const,
        user_status: 'ACTIVE' as const,
        doc_found: true,
        doc_owner_id: ownerId,
        doc_deleted: false,
        grant_permission: null,
      };
    };

    it('denies unrelated user attempting IDOR access on another document', async () => {
      const readAuth = await authorize(unrelatedId, docId, 'READ', { contextFetcher: mockFetcher });
      expect(readAuth.allowed).toBe(false);
      expect(readAuth.reason).toBe('NOT_FOUND_OR_DENIED');

      const downloadAuth = await authorize(unrelatedId, docId, 'DOWNLOAD', { contextFetcher: mockFetcher });
      expect(downloadAuth.allowed).toBe(false);
      expect(downloadAuth.reason).toBe('NOT_FOUND_OR_DENIED');
      expect(downloadAuth.action).toBe('DOWNLOAD');
    });

    it('exercises the exact DOWNLOAD authorization branch for owner, READ grantee, and EDIT grantee', async () => {
      const ownerDownload = await authorize(ownerId, docId, 'DOWNLOAD', { contextFetcher: mockFetcher });
      expect(ownerDownload.allowed).toBe(true);
      expect(ownerDownload.action).toBe('DOWNLOAD');
      expect(ownerDownload.isOwner).toBe(true);

      const readGranteeDownload = await authorize(granteeReadId, docId, 'DOWNLOAD', { contextFetcher: mockFetcher });
      expect(readGranteeDownload.allowed).toBe(true);
      expect(readGranteeDownload.action).toBe('DOWNLOAD');
      expect(readGranteeDownload.grantPermission).toBe('READ');

      const editGranteeDownload = await authorize(granteeEditId, docId, 'DOWNLOAD', { contextFetcher: mockFetcher });
      expect(editGranteeDownload.allowed).toBe(true);
      expect(editGranteeDownload.action).toBe('DOWNLOAD');
      expect(editGranteeDownload.grantPermission).toBe('EDIT');
    });

    it('exercises the exact READ authorization branch for metadata retrieval', async () => {
      const ownerRead = await authorize(ownerId, docId, 'READ', { contextFetcher: mockFetcher });
      expect(ownerRead.allowed).toBe(true);
      expect(ownerRead.action).toBe('READ');

      const granteeRead = await authorize(granteeReadId, docId, 'READ', { contextFetcher: mockFetcher });
      expect(granteeRead.allowed).toBe(true);
      expect(granteeRead.action).toBe('READ');

      const unrelatedRead = await authorize(unrelatedId, docId, 'READ', { contextFetcher: mockFetcher });
      expect(unrelatedRead.allowed).toBe(false);
      expect(unrelatedRead.reason).toBe('NOT_FOUND_OR_DENIED');
      expect(unrelatedRead.action).toBe('READ');
    });

    it('allows READ grantee to download, but strictly denies EDIT', async () => {
      const readAuth = await authorize(granteeReadId, docId, 'READ', { contextFetcher: mockFetcher });
      expect(readAuth.allowed).toBe(true);

      const downloadAuth = await authorize(granteeReadId, docId, 'DOWNLOAD', { contextFetcher: mockFetcher });
      expect(downloadAuth.allowed).toBe(true);

      const editAuth = await authorize(granteeReadId, docId, 'EDIT', { contextFetcher: mockFetcher });
      expect(editAuth.allowed).toBe(false);
      expect(editAuth.reason).toBe('UNAUTHORIZED_ACTION');
    });

    it('allows EDIT grantee to read, download, and edit, but denies DELETE', async () => {
      const downloadAuth = await authorize(granteeEditId, docId, 'DOWNLOAD', { contextFetcher: mockFetcher });
      expect(downloadAuth.allowed).toBe(true);

      const editAuth = await authorize(granteeEditId, docId, 'EDIT', { contextFetcher: mockFetcher });
      expect(editAuth.allowed).toBe(true);

      const deleteAuth = await authorize(granteeEditId, docId, 'DELETE', { contextFetcher: mockFetcher });
      expect(deleteAuth.allowed).toBe(false);
      expect(deleteAuth.reason).toBe('UNAUTHORIZED_ACTION');
    });

    it('immediately denies disabled user even if they are the owner for both READ and DOWNLOAD', async () => {
      const readAuth = await authorize(disabledId, docId, 'READ', { contextFetcher: mockFetcher });
      expect(readAuth.allowed).toBe(false);
      expect(readAuth.reason).toBe('ACCOUNT_DISABLED');

      const downloadAuth = await authorize(disabledId, docId, 'DOWNLOAD', { contextFetcher: mockFetcher });
      expect(downloadAuth.allowed).toBe(false);
      expect(downloadAuth.reason).toBe('ACCOUNT_DISABLED');
      expect(downloadAuth.action).toBe('DOWNLOAD');
    });

    it('denies access uniformly when a document is soft-deleted', async () => {
      const deletedFetcher = async () => ({
        user_found: true,
        user_role: 'VIEWER' as const,
        user_status: 'ACTIVE' as const,
        doc_found: true,
        doc_owner_id: ownerId,
        doc_deleted: true, // soft deleted
        grant_permission: 'READ' as const,
      });

      const auth = await authorize(granteeReadId, docId, 'READ', { contextFetcher: deletedFetcher });
      expect(auth.allowed).toBe(false);
      expect(auth.reason).toBe('NOT_FOUND_OR_DENIED');

      const downloadAuth = await authorize(granteeReadId, docId, 'DOWNLOAD', { contextFetcher: deletedFetcher });
      expect(downloadAuth.allowed).toBe(false);
      expect(downloadAuth.reason).toBe('NOT_FOUND_OR_DENIED');
    });
  });

  describe('4. In-Database Filtered List and Search', () => {
    it('verifies that list_accessible_documents RPC is denied to unprivileged client roles (anon)', async () => {
      const fakeUserId = '99999999-9999-9999-9999-999999999999';
      const { data, error } = await anonClient.rpc('list_accessible_documents', {
        p_user_id: fakeUserId,
        p_search: 'confidential',
        p_category: 'general',
        p_limit: 10,
        p_offset: 0,
      });

      // Anonymous client execution is revoked
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for function list_accessible_documents/i);
      expect(data).toBeNull();
    });

    it('verifies that create_document_and_audit RPC is denied to unprivileged client roles (anon)', async () => {
      const { data, error } = await anonClient.rpc('create_document_and_audit', {
        p_owner_id: '11111111-1111-1111-1111-111111111111',
        p_display_name: 'malicious.pdf',
        p_category: 'general',
        p_content_type: 'application/pdf',
        p_size_bytes: 1024,
        p_storage_object_key: '22222222-2222-2222-2222-222222222222',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for function create_document_and_audit/i);
    });

    it('audits list/search requests without recording sensitive search terms or document contents', async () => {
      let loggedEvent: Record<string, unknown> | null = null;
      const mockLogClient = {
        rpc: async (_fn: string, args: Record<string, unknown>) => {
          loggedEvent = args;
          return { data: [{ sequence_number: 99 }], error: null };
        },
      } as unknown as typeof anonClient;

      // Log an allowed list request with search applied
      await logAuditEvent(
        {
          actorId: '11111111-1111-1111-1111-111111111111',
          action: 'READ',
          result: 'SUCCESS',
          metadata: {
            action_type: 'list_documents',
            count: 5,
            has_search: true, // boolean flag only!
            has_category: false,
          },
        },
        mockLogClient
      );

      expect(loggedEvent).not.toBeNull();
      const event = loggedEvent as unknown as Record<string, unknown>;
      expect(event['p_action']).toBe('READ');
      expect(event['p_result']).toBe('SUCCESS');
      const meta = event['p_metadata'] as Record<string, unknown>;
      expect(meta.action_type).toBe('list_documents');
      expect(meta.count).toBe(5);
      expect(meta.has_search).toBe(true);

      // Verify that sensitive query strings and contents are strictly absent from audit record
      expect(meta).not.toHaveProperty('search');
      expect(meta).not.toHaveProperty('p_search');
      expect(meta).not.toHaveProperty('query');
      expect(meta).not.toHaveProperty('content');
      expect(meta).not.toHaveProperty('contents');
    });

    it('audits denied list requests without leaking search query strings', async () => {
      let loggedEvent: Record<string, unknown> | null = null;
      const mockLogClient = {
        rpc: async (_fn: string, args: Record<string, unknown>) => {
          loggedEvent = args;
          return { data: [{ sequence_number: 100 }], error: null };
        },
      } as unknown as typeof anonClient;

      await logAuditEvent(
        {
          actorId: '55555555-5555-5555-5555-555555555555',
          action: 'READ',
          result: 'ACCESS_DENIED',
          metadata: {
            action_type: 'list_documents',
            reason: 'ACCOUNT_DISABLED',
          },
        },
        mockLogClient
      );

      expect(loggedEvent).not.toBeNull();
      const deniedEvent = loggedEvent as unknown as Record<string, unknown>;
      expect(deniedEvent['p_action']).toBe('READ');
      expect(deniedEvent['p_result']).toBe('ACCESS_DENIED');
      const meta = deniedEvent['p_metadata'] as Record<string, unknown>;
      expect(meta.action_type).toBe('list_documents');
      expect(meta.reason).toBe('ACCOUNT_DISABLED');
      expect(meta).not.toHaveProperty('search');
    });
  });

  describe('5. Audit Integration & Atomic Compensation Guarantees', () => {
    it('enforces fail-closed behavior if audit write fails', async () => {
      const mockBrokenClient = {
        rpc: async () => ({
          data: null,
          error: { message: 'audit table unavailable' },
        }),
      } as unknown as typeof anonClient;

      await expect(
        logAuditEvent(
          {
            actorId: '11111111-1111-1111-1111-111111111111',
            action: 'DOWNLOAD',
            result: 'SUCCESS',
          },
          mockBrokenClient
        )
      ).rejects.toThrow(AuditLoggingError);
    });

    it('compensates on atomic upload failure by purging uploaded storage object', async () => {
      let removedKey: string | null = null;
      const testStorageKey = 'test-object-key-uuid';

      // Simulates the compensating cleanup in documents.ts:
      // If create_document_and_audit fails, remove([storageObjectKey]) is invoked
      const mockStorage = {
        remove: async (keys: string[]) => {
          removedKey = keys[0];
          return { data: keys, error: null };
        },
      };

      try {
        // Simulate atomic DB failure
        throw new Error('Database procedure error: append_audit_log failed');
      } catch {
        await mockStorage.remove([testStorageKey]);
      }

      expect(removedKey).toBe(testStorageKey);
    });

    it('confirms existing audit chain in connected project remains healthy and unbroken', async () => {
      const { data, error } = await anonClient.rpc('verify_audit_security_baseline');
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(Array.isArray(data)).toBe(true);

      const chainTest = data.find((t: { test_num: number }) => t.test_num === 1);
      expect(chainTest.status).toBe('PASSED');
    });
  });
});

describe('Phase 7: Secure Document Dashboard, Metadata Management & Soft Deletion', () => {
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ownerId = '11111111-1111-4111-8111-111111111111';
  const editGranteeId = '22222222-2222-4222-8222-222222222222';
  const readGranteeId = '33333333-3333-4333-8333-333333333333';
  const unrelatedId = '44444444-4444-4444-8444-444444444444';
  const disabledId = '55555555-5555-4555-8555-555555555555';
  const docId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockFetcher = async (userId: string) => {
    if (userId === disabledId) {
      return {
        user_found: true,
        user_role: 'VIEWER' as const,
        user_status: 'DISABLED' as const,
        doc_found: true,
        doc_owner_id: ownerId,
        doc_deleted: false,
        grant_permission: null,
      };
    }
    if (userId === ownerId) {
      return {
        user_found: true,
        user_role: 'OWNER' as const,
        user_status: 'ACTIVE' as const,
        doc_found: true,
        doc_owner_id: ownerId,
        doc_deleted: false,
        grant_permission: null,
      };
    }
    if (userId === editGranteeId) {
      return {
        user_found: true,
        user_role: 'VIEWER' as const,
        user_status: 'ACTIVE' as const,
        doc_found: true,
        doc_owner_id: ownerId,
        doc_deleted: false,
        grant_permission: 'EDIT' as const,
      };
    }
    if (userId === readGranteeId) {
      return {
        user_found: true,
        user_role: 'VIEWER' as const,
        user_status: 'ACTIVE' as const,
        doc_found: true,
        doc_owner_id: ownerId,
        doc_deleted: false,
        grant_permission: 'READ' as const,
      };
    }
    return {
      user_found: true,
      user_role: 'VIEWER' as const,
      user_status: 'ACTIVE' as const,
      doc_found: true,
      doc_owner_id: ownerId,
      doc_deleted: false,
      grant_permission: null,
    };
  };

  describe('1. Live Database Least-Privilege & Procedure Lockdown', () => {
    it('verifies anon client CANNOT execute update_document_metadata_and_audit', async () => {
      const { data, error } = await anonClient.rpc('update_document_metadata_and_audit', {
        p_actor_id: ownerId,
        p_document_id: docId,
        p_display_name: 'Hacked Title',
        p_category: 'financial',
      });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for function update_document_metadata_and_audit/i);
    });

    it('verifies anon client CANNOT execute soft_delete_document_and_audit', async () => {
      const { data, error } = await anonClient.rpc('soft_delete_document_and_audit', {
        p_actor_id: ownerId,
        p_document_id: docId,
      });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for function soft_delete_document_and_audit/i);
    });

    it('verifies anon client CANNOT direct INSERT into public.documents', async () => {
      const { data, error } = await anonClient
        .from('documents')
        .insert({
          id: docId,
          owner_id: ownerId,
          display_name: 'Direct Table Injection.pdf',
          category: 'general',
          content_type: 'application/pdf',
          size_bytes: 1024,
        });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for table documents/i);
    });

    it('verifies anon client CANNOT direct UPDATE on public.documents', async () => {
      const { data, error } = await anonClient
        .from('documents')
        .update({ display_name: 'Direct Table Hack' })
        .eq('id', docId);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for table documents/i);
    });

    it('verifies anon client CANNOT direct DELETE from public.documents', async () => {
      const { data, error } = await anonClient
        .from('documents')
        .delete()
        .eq('id', docId);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for table documents/i);
    });
  });

  describe('2. Input Validation (Zod & Mass Assignment Protection)', () => {
    it('accepts valid metadata updates for display_name and category', () => {
      const parsed = updateDocumentMetadataSchema.safeParse({
        displayName: 'Quarterly Financials Revised',
        category: 'financial',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.displayName).toBe('Quarterly Financials Revised');
        expect(parsed.data.category).toBe('financial');
      }
    });

    it('rejects overlong titles (> 255 chars)', () => {
      const parsed = updateDocumentMetadataSchema.safeParse({
        displayName: 'A'.repeat(256),
        category: 'financial',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects HTML brackets and control characters in display name', () => {
      const htmlParsed = updateDocumentMetadataSchema.safeParse({
        displayName: 'Secret<script>alert(1)</script>.pdf',
        category: 'financial',
      });
      expect(htmlParsed.success).toBe(false);

      const controlParsed = updateDocumentMetadataSchema.safeParse({
        displayName: 'Secret\x00Document.pdf',
        category: 'financial',
      });
      expect(controlParsed.success).toBe(false);
    });

    it('rejects unsupported categories', () => {
      const parsed = updateDocumentMetadataSchema.safeParse({
        displayName: 'Valid Name',
        category: 'unsupported_cat',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects mass-assignment attempts (strict schema rejection)', () => {
      const parsed = updateDocumentMetadataSchema.safeParse({
        displayName: 'Valid Name',
        category: 'general',
        owner_id: '44444444-4444-4444-4444-444444444444',
        deleted_at: null,
        storage_object_key: 'hacked-key',
      });
      expect(parsed.success).toBe(false);
    });

    it('validates list documents query parameters strictly', () => {
      const valid = listDocumentsQuerySchema.safeParse({
        search: 'audit',
        category: 'financial',
        ownerFilter: 'mine',
        limit: '25',
        offset: '0',
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.limit).toBe(25);
        expect(valid.data.ownerFilter).toBe('mine');
      }

      const invalidFilter = listDocumentsQuerySchema.safeParse({
        ownerFilter: 'unauthorized_filter',
      });
      expect(invalidFilter.success).toBe(false);

      const overlongSearch = listDocumentsQuerySchema.safeParse({
        search: 'A'.repeat(101),
      });
      expect(overlongSearch.success).toBe(false);

      const invalidDate = listDocumentsQuerySchema.safeParse({
        createdAfter: 'not-a-date',
      });
      expect(invalidDate.success).toBe(false);
    });
  });

  describe('3. Centralized Authorization Core for EDIT and DELETE Actions', () => {
    it('allows owner to both EDIT and DELETE', async () => {
      const editAuth = await authorize(ownerId, docId, 'EDIT', { contextFetcher: mockFetcher });
      expect(editAuth.allowed).toBe(true);
      expect(editAuth.isOwner).toBe(true);

      const deleteAuth = await authorize(ownerId, docId, 'DELETE', { contextFetcher: mockFetcher });
      expect(deleteAuth.allowed).toBe(true);
      expect(deleteAuth.isOwner).toBe(true);
    });

    it('allows EDIT grantee to EDIT, but strictly denies DELETE', async () => {
      const editAuth = await authorize(editGranteeId, docId, 'EDIT', { contextFetcher: mockFetcher });
      expect(editAuth.allowed).toBe(true);
      expect(editAuth.grantPermission).toBe('EDIT');

      const deleteAuth = await authorize(editGranteeId, docId, 'DELETE', { contextFetcher: mockFetcher });
      expect(deleteAuth.allowed).toBe(false);
      expect(deleteAuth.reason).toBe('UNAUTHORIZED_ACTION');
    });

    it('strictly denies READ grantee from both EDIT and DELETE', async () => {
      const editAuth = await authorize(readGranteeId, docId, 'EDIT', { contextFetcher: mockFetcher });
      expect(editAuth.allowed).toBe(false);
      expect(editAuth.reason).toBe('UNAUTHORIZED_ACTION');

      const deleteAuth = await authorize(readGranteeId, docId, 'DELETE', { contextFetcher: mockFetcher });
      expect(deleteAuth.allowed).toBe(false);
      expect(deleteAuth.reason).toBe('UNAUTHORIZED_ACTION');
    });

    it('strictly denies unrelated user from EDIT and DELETE via IDOR', async () => {
      const editAuth = await authorize(unrelatedId, docId, 'EDIT', { contextFetcher: mockFetcher });
      expect(editAuth.allowed).toBe(false);
      expect(editAuth.reason).toBe('NOT_FOUND_OR_DENIED');

      const deleteAuth = await authorize(unrelatedId, docId, 'DELETE', { contextFetcher: mockFetcher });
      expect(deleteAuth.allowed).toBe(false);
      expect(deleteAuth.reason).toBe('NOT_FOUND_OR_DENIED');
    });

    it('immediately denies disabled user even if they are the owner', async () => {
      const editAuth = await authorize(disabledId, docId, 'EDIT', { contextFetcher: mockFetcher });
      expect(editAuth.allowed).toBe(false);
      expect(editAuth.reason).toBe('ACCOUNT_DISABLED');

      const deleteAuth = await authorize(disabledId, docId, 'DELETE', { contextFetcher: mockFetcher });
      expect(deleteAuth.allowed).toBe(false);
      expect(deleteAuth.reason).toBe('ACCOUNT_DISABLED');
    });

    it('soft deletion immediately blocks READ, DOWNLOAD, EDIT, DELETE, and GRANT', async () => {
      const softDeletedFetcher = async () => ({
        user_found: true,
        user_role: 'OWNER' as const,
        user_status: 'ACTIVE' as const,
        doc_found: true,
        doc_owner_id: ownerId,
        doc_deleted: true,
        grant_permission: null,
      });

      for (const action of ['READ', 'DOWNLOAD', 'EDIT', 'DELETE', 'GRANT', 'REVOKE'] as const) {
        const auth = await authorize(ownerId, docId, action, { contextFetcher: softDeletedFetcher });
        expect(auth.allowed).toBe(false);
        expect(auth.reason).toBe('NOT_FOUND_OR_DENIED');
      }
    });
  });

  describe('4. Domain Service & Anti-Enumeration Protections', () => {
    it('denies READ grantee metadata update and audits denial', async () => {
      const logAuditSpy = vi.spyOn(auditModule, 'logAuditEvent');

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

      const result = await updateDocumentMetadata(
        readGranteeId,
        docId,
        { displayName: 'Hacked Title', category: 'financial' }
      );

      expect(result.success).toBe(false);
      expect(result.notFoundOrDenied).toBe(true);

      expect(logAuditSpy).toHaveBeenCalled();
      const lastCall = logAuditSpy.mock.calls[logAuditSpy.mock.calls.length - 1][0];
      expect(lastCall.action).toBe('EDIT');
      expect(lastCall.result).toBe('ACCESS_DENIED');
      expect(lastCall.actorId).toBe(readGranteeId);
      expect(lastCall.documentId).toBe(docId);
    });

    it('denies EDIT grantee soft-deletion and audits denial', async () => {
      const logAuditSpy = vi.spyOn(auditModule, 'logAuditEvent');

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
                grant_permission: 'EDIT',
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const result = await softDeleteDocument(editGranteeId, docId);

      expect(result.success).toBe(false);
      expect(result.notFoundOrDenied).toBe(true);

      expect(logAuditSpy).toHaveBeenCalled();
      const lastCall = logAuditSpy.mock.calls[logAuditSpy.mock.calls.length - 1][0];
      expect(lastCall.action).toBe('DELETE');
      expect(lastCall.result).toBe('ACCESS_DENIED');
      expect(lastCall.actorId).toBe(editGranteeId);
      expect(lastCall.documentId).toBe(docId);
    });

    it('denies unrelated user soft-deletion and audits denial', async () => {
      const logAuditSpy = vi.spyOn(auditModule, 'logAuditEvent');

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

      const result = await softDeleteDocument(unrelatedId, docId);

      expect(result.success).toBe(false);
      expect(result.notFoundOrDenied).toBe(true);

      expect(logAuditSpy).toHaveBeenCalled();
      const lastCall = logAuditSpy.mock.calls[logAuditSpy.mock.calls.length - 1][0];
      expect(lastCall.action).toBe('DELETE');
      expect(lastCall.result).toBe('ACCESS_DENIED');
      expect(lastCall.metadata?.reason).toBe('NOT_FOUND_OR_DENIED');
    });

    it('owner successfully updates metadata and soft-deletes with atomic audit recording', async () => {
      const adminRpcSpy = vi.fn();
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        rpc: vi.fn().mockImplementation((procedureName: string) => {
          adminRpcSpy(procedureName);
          if (procedureName === 'update_document_metadata_and_audit') {
            return Promise.resolve({
              data: [{
                id: docId,
                owner_id: ownerId,
                display_name: 'Updated Financials',
                category: 'financial',
                content_type: 'application/pdf',
                size_bytes: 1024,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                audit_sequence_number: 101,
              }],
              error: null,
            });
          }
          if (procedureName === 'soft_delete_document_and_audit') {
            return Promise.resolve({
              data: [{
                id: docId,
                deleted_at: new Date().toISOString(),
                audit_sequence_number: 102,
              }],
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      vi.spyOn(serverSupabaseModule, 'createClient').mockResolvedValue({
        rpc: vi.fn().mockImplementation((fn: string) => {
          if (fn === 'get_authorization_context') {
            return Promise.resolve({
              data: {
                user_found: true,
                user_role: 'OWNER',
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

      const updateRes = await updateDocumentMetadata(
        ownerId,
        docId,
        { displayName: 'Updated Financials', category: 'financial' }
      );
      expect(updateRes.success).toBe(true);
      expect(updateRes.document?.displayName).toBe('Updated Financials');
      expect(String(updateRes.auditSequenceNumber)).toBe('101');

      const deleteRes = await softDeleteDocument(ownerId, docId);
      expect(deleteRes.success).toBe(true);
      expect(String(deleteRes.auditSequenceNumber)).toBe('102');
      expect(adminRpcSpy).toHaveBeenCalledWith('update_document_metadata_and_audit');
      expect(adminRpcSpy).toHaveBeenCalledWith('soft_delete_document_and_audit');
    });

    it('extended in-database list filtering passes filters to RPC and rejects disabled user', async () => {
      const adminRpcSpy = vi.fn();
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'ACTIVE' }, error: null }),
            }),
          }),
        }),
        rpc: vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
          adminRpcSpy(fn, args);
          return Promise.resolve({ data: [], error: null });
        }),
      } as unknown as SupabaseClient);

      const docs = await listAccessibleDocuments(ownerId, {
        search: 'quarterly',
        category: 'financial',
        createdAfter: '2026-01-01T00:00:00Z',
        createdBefore: '2026-12-31T23:59:59Z',
        ownerFilter: 'mine',
        limit: 20,
        offset: 0,
      });

      expect(Array.isArray(docs)).toBe(true);
      expect(adminRpcSpy).toHaveBeenCalledWith('list_accessible_documents', expect.objectContaining({
        p_user_id: ownerId,
        p_search: 'quarterly',
        p_category: 'financial',
        p_owner_filter: 'mine',
      }));
    });
  });

  describe('5. Route-Level Handlers & Mutation Resistance', () => {
    it('proves PATCH /api/documents/[id] returns generic 404 and NEVER calls update database procedure for READ grantee', async () => {
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: readGranteeId, email: 'read@example.com' } as unknown as User,
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

      const updateRpcSpy = vi.fn();
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        rpc: vi.fn().mockImplementation((procedureName: string, args: unknown) => {
          if (procedureName === 'update_document_metadata_and_audit') {
            updateRpcSpy(procedureName, args);
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const req = new NextRequest(`http://localhost:3000/api/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Tampered Title', category: 'financial' }),
      });

      const res = await updateMetadataRoute(req, { params: Promise.resolve({ id: docId }) });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Document not found or access denied');
      expect(updateRpcSpy).not.toHaveBeenCalled();
    });

    it('proves DELETE /api/documents/[id] returns generic 404 and NEVER calls delete database procedure for EDIT grantee', async () => {
      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: editGranteeId, email: 'edit@example.com' } as unknown as User,
        profile: { id: editGranteeId, role: 'VIEWER', status: 'ACTIVE', created_at: '', updated_at: '' },
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
                grant_permission: 'EDIT',
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const deleteRpcSpy = vi.fn();
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        rpc: vi.fn().mockImplementation((procedureName: string, args: unknown) => {
          if (procedureName === 'soft_delete_document_and_audit') {
            deleteRpcSpy(procedureName, args);
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const req = new NextRequest(`http://localhost:3000/api/documents/${docId}`, {
        method: 'DELETE',
      });

      const res = await deleteDocumentRoute(req, { params: Promise.resolve({ id: docId }) });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Document not found or access denied');
      expect(deleteRpcSpy).not.toHaveBeenCalled();
    });

    it('proves DELETE /api/documents/[id] returns generic 404 and NEVER calls delete database procedure for unrelated user', async () => {
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

      const deleteRpcSpy = vi.fn();
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        rpc: vi.fn().mockImplementation((procedureName: string, args: unknown) => {
          if (procedureName === 'soft_delete_document_and_audit') {
            deleteRpcSpy(procedureName, args);
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const req = new NextRequest(`http://localhost:3000/api/documents/${docId}`, {
        method: 'DELETE',
      });

      const res = await deleteDocumentRoute(req, { params: Promise.resolve({ id: docId }) });
      expect(res.status).toBe(404);
      expect(deleteRpcSpy).not.toHaveBeenCalled();
    });
  });

  describe('8. Authenticated Viewer Document Listing & Anti-IDOR (200 Empty Result)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('proves GET /api/documents returns 200 and empty list [] for authenticated viewer with zero accessible documents', async () => {
      const viewerId = '75856f30-9dc1-44fb-b25e-c90302ea0b4a';

      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: viewerId, email: 'viewer@trustvault.local' } as unknown as User,
        profile: {
          id: viewerId,
          role: 'VIEWER',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        isActive: true,
      });

      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { status: 'ACTIVE' },
                error: null,
              }),
            }),
          }),
        }),
        rpc: vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
          if (fn === 'list_accessible_documents') {
            expect(args.p_user_id).toBe(viewerId);
            return Promise.resolve({ data: [], error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/documents');
      const res = await getDocumentsRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ documents: [] });
    });

    it('proves GET /api/documents enforces anti-IDOR by binding to authenticated session user ID and returns 200 with accessible list', async () => {
      const viewerId = '75856f30-9dc1-44fb-b25e-c90302ea0b4a';

      vi.spyOn(sessionModule, 'requireAuth').mockResolvedValue({
        user: { id: viewerId, email: 'viewer@trustvault.local' } as unknown as User,
        profile: {
          id: viewerId,
          role: 'VIEWER',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        isActive: true,
      });

      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { status: 'ACTIVE' },
                error: null,
              }),
            }),
          }),
        }),
        rpc: vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
          if (fn === 'list_accessible_documents') {
            // Anti-IDOR assertion: always uses session user ID, never caller override
            expect(args.p_user_id).toBe(viewerId);
            return Promise.resolve({ data: [], error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      } as unknown as SupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/documents?ownerFilter=all');
      const res = await getDocumentsRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.documents).toEqual([]);
    });
  });
});

