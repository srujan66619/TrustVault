import { describe, it, expect } from 'vitest';
import {
  logAuditEvent,
  verifyAuditChain,
  AuditLoggingError,
  type AuditLogInput,
} from '../src/lib/audit/audit';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mgqrzzbyzuyygufcpaun.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncXJ6emJ5enV5eWd1ZmNwYXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MzY3NjYsImV4cCI6MjEwODMxMjc2Nn0.WAsQeAE_DW56-PywWFp_9IG43Oy0b_UiuJtdg-thSy4';

describe('Phase 4: Tamper-Evident Audit-Log Infrastructure (audit.ts)', () => {
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  describe('Live Supabase Security & Privilege Verification', () => {
    it('verifies that unprivileged browser client (anon) CANNOT execute append_audit_log', async () => {
      const { data, error } = await anonClient.rpc('append_audit_log', {
        p_actor_id: null,
        p_document_id: null,
        p_action: 'MALICIOUS_BROWSER_INJECTION',
        p_result: 'SUCCESS',
        p_metadata: {},
        p_ip_address: null,
        p_user_agent: null,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      // PostgreSQL 42501 permission denied for function append_audit_log
      expect(error?.message).toMatch(/permission denied for function append_audit_log/i);
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

    it('verifies that unprivileged browser client (anon) CANNOT execute verify_audit_chain', async () => {
      const { data, error } = await anonClient.rpc('verify_audit_chain', {
        p_from_sequence: 1,
        p_limit: 10,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied for function verify_audit_chain/i);
    });

    it('executes live database verification suite verify_audit_security_baseline (16 tests)', async () => {
      const { data, error } = await anonClient.rpc('verify_audit_security_baseline');

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(16);

      // Verify that every test case passed in the live database
      for (const testResult of data) {
        expect(testResult.status).toBe('PASSED');
      }

      // Explicitly assert service_role lockdown tests
      const serviceRoleDirectWritesRevoked = data.find(
        (t: { test_num: number }) => t.test_num === 9
      );
      expect(serviceRoleDirectWritesRevoked.status).toBe('PASSED');
      expect(serviceRoleDirectWritesRevoked.details).toMatch(/revoked from service_role/i);

      const serviceRoleAppendsViaRpc = data.find(
        (t: { test_num: number }) => t.test_num === 10
      );
      expect(serviceRoleAppendsViaRpc.status).toBe('PASSED');
      expect(serviceRoleAppendsViaRpc.details).toMatch(/service_role holds EXECUTE on append_audit_log/i);

      const chainValidation = data.find(
        (t: { test_num: number }) => t.test_num === 11
      );
      expect(chainValidation.status).toBe('PASSED');
      expect(chainValidation.details).toMatch(/verified successfully/i);
    });
  });

  describe('logAuditEvent (Fail-Closed Behavior & Validation)', () => {
    it('fails closed and throws AuditLoggingError on null or empty action', async () => {
      const input: AuditLogInput = {
        action: '',
        result: 'SUCCESS',
      };

      await expect(logAuditEvent(input, anonClient)).rejects.toThrow(AuditLoggingError);
      await expect(logAuditEvent(input, anonClient)).rejects.toThrow(
        /Audit action cannot be null or empty/
      );
    });

    it('fails closed and throws AuditLoggingError on null or empty result', async () => {
      const input = {
        action: 'READ',
        result: '',
      } as unknown as AuditLogInput;

      await expect(logAuditEvent(input, anonClient)).rejects.toThrow(AuditLoggingError);
      await expect(logAuditEvent(input, anonClient)).rejects.toThrow(
        /Audit result cannot be null or empty/
      );
    });

    it('fails closed and wraps database execution errors into AuditLoggingError', async () => {
      // Mock client that returns a database constraint or network error
      const mockFailingClient = {
        rpc: async () => ({
          data: null,
          error: { message: 'relation "audit_logs" connection timeout' },
        }),
      } as unknown as typeof anonClient;

      const input: AuditLogInput = {
        action: 'DOWNLOAD',
        result: 'SUCCESS',
      };

      await expect(logAuditEvent(input, mockFailingClient)).rejects.toThrow(
        AuditLoggingError
      );
      await expect(logAuditEvent(input, mockFailingClient)).rejects.toThrow(
        /Audit logging failure \(fail-closed\): relation "audit_logs" connection timeout/
      );
    });

    it('correctly maps valid RPC output into a structured AuditRecord', async () => {
      const mockSuccessClient = {
        rpc: async () => ({
          data: [
            {
              id: 'a0000000-0000-0000-0000-000000000001',
              sequence_number: '42',
              actor_id: 'b0000000-0000-0000-0000-000000000002',
              document_id: 'c0000000-0000-0000-0000-000000000003',
              action: 'DOWNLOAD',
              result: 'SUCCESS',
              timestamp: '2026-10-23T17:30:00.000000Z',
              prev_hash:
                '1111111111111111111111111111111111111111111111111111111111111111',
              row_hash:
                '2222222222222222222222222222222222222222222222222222222222222222',
              metadata: { ip: '192.168.1.1' },
            },
          ],
          error: null,
        }),
      } as unknown as typeof anonClient;

      const record = await logAuditEvent(
        { action: 'DOWNLOAD', result: 'SUCCESS' },
        mockSuccessClient
      );

      expect(record.sequenceNumber).toBe(42);
      expect(record.actorId).toBe('b0000000-0000-0000-0000-000000000002');
      expect(record.documentId).toBe('c0000000-0000-0000-0000-000000000003');
      expect(record.action).toBe('DOWNLOAD');
      expect(record.result).toBe('SUCCESS');
      expect(record.prevHash).toBe(
        '1111111111111111111111111111111111111111111111111111111111111111'
      );
      expect(record.rowHash).toBe(
        '2222222222222222222222222222222222222222222222222222222222222222'
      );
      expect(record.metadata).toEqual({ ip: '192.168.1.1' });
    });
  });

  describe('verifyAuditChain (Chain Integrity Reporting)', () => {
    it('correctly maps verification response from verify_audit_chain', async () => {
      const mockVerificationClient = {
        rpc: async () => ({
          data: [
            {
              is_valid: true,
              total_verified: 42,
              failed_at_sequence: null,
              failure_reason: null,
              expected_value: null,
              actual_value: null,
            },
          ],
          error: null,
        }),
      } as unknown as typeof anonClient;

      const report = await verifyAuditChain(1, 100, mockVerificationClient);

      expect(report.isValid).toBe(true);
      expect(report.totalVerified).toBe(42);
      expect(report.failedAtSequence).toBeNull();
      expect(report.failureReason).toBeNull();
    });

    it('correctly reports corruption details when verify_audit_chain detects a mismatch', async () => {
      const mockBrokenClient = {
        rpc: async () => ({
          data: [
            {
              is_valid: false,
              total_verified: 5,
              failed_at_sequence: '6',
              failure_reason: 'Broken prev_hash chain link',
              expected_value: 'abc',
              actual_value: 'def',
            },
          ],
          error: null,
        }),
      } as unknown as typeof anonClient;

      const report = await verifyAuditChain(1, 100, mockBrokenClient);

      expect(report.isValid).toBe(false);
      expect(report.totalVerified).toBe(5);
      expect(report.failedAtSequence).toBe(6);
      expect(report.failureReason).toBe('Broken prev_hash chain link');
      expect(report.expectedValue).toBe('abc');
      expect(report.actualValue).toBe('def');
    });
  });
});
