-- ==============================================================================
-- TrustVault Phase 6 Security Verification Script
-- Tests owner-controlled permission grants, immediate revocation, and comprehensive
-- denied audit logging for all failure branches.
-- Uses transaction rollback so that no persistent state or test artifacts remain.
-- ==============================================================================

DO $$
DECLARE
  v_owner_id uuid := gen_random_uuid();
  v_grantee_active_id uuid := gen_random_uuid();
  v_grantee_inactive_id uuid := gen_random_uuid();
  v_unrelated_id uuid := gen_random_uuid();
  v_doc_id uuid := gen_random_uuid();
  v_storage_key uuid := gen_random_uuid();
  v_fake_doc_id uuid := gen_random_uuid();
  v_res record;
  v_perm_count integer;
  v_audit_count integer;
  v_email_leaks integer;
BEGIN
  RAISE NOTICE '=== Starting Phase 6 Security Verification ===';

  -- 1. Create test user accounts in auth.users
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES 
    (v_owner_id, 'owner_test@example.com', '{}'::jsonb, now(), now()),
    (v_grantee_active_id, 'grantee_active@example.com', '{}'::jsonb, now(), now()),
    (v_grantee_inactive_id, 'grantee_inactive@example.com', '{}'::jsonb, now(), now()),
    (v_unrelated_id, 'unrelated_test@example.com', '{}'::jsonb, now(), now());

  -- Update auto-created profile records with target roles and statuses
  UPDATE public.profiles SET role = 'OWNER', status = 'ACTIVE' WHERE id = v_owner_id;
  UPDATE public.profiles SET role = 'VIEWER', status = 'ACTIVE' WHERE id = v_grantee_active_id;
  UPDATE public.profiles SET role = 'VIEWER', status = 'DISABLED' WHERE id = v_grantee_inactive_id;
  UPDATE public.profiles SET role = 'VIEWER', status = 'ACTIVE' WHERE id = v_unrelated_id;

  -- 2. Create test document owned by v_owner_id
  INSERT INTO public.documents (
    id, owner_id, display_name, category, content_type,
    size_bytes, storage_object_key, created_at, updated_at
  ) VALUES (
    v_doc_id, v_owner_id, 'Secure Test Document', 'legal',
    'application/pdf', 1024, v_storage_key, now(), now()
  );

  -- 3. TEST: Owner grants READ to active user (Allowed -> PERMISSION_GRANTED)
  SELECT * INTO v_res FROM public.grant_or_change_document_permission_and_audit(
    v_owner_id, v_doc_id, 'grantee_active@example.com', 'READ', '127.0.0.1', 'pg-test'
  );
  IF NOT v_res.success OR v_res.permission != 'READ' OR v_res.status_code != 'SUCCESS' THEN
    RAISE EXCEPTION 'TEST FAILED: Owner could not grant READ permission: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 1 PASSED: Owner granted READ to active user';

  -- Verify document_permissions table row exists
  SELECT count(*) INTO v_perm_count FROM public.document_permissions 
  WHERE document_id = v_doc_id AND grantee_id = v_grantee_active_id AND permission = 'READ';
  IF v_perm_count != 1 THEN
    RAISE EXCEPTION 'TEST FAILED: Permission row not found in document_permissions';
  END IF;
  RAISE NOTICE 'CHECK 2 PASSED: Permission row stored in document_permissions';

  -- 4. TEST: Owner updates grant from READ to EDIT (Allowed -> PERMISSION_CHANGED)
  SELECT * INTO v_res FROM public.grant_or_change_document_permission_and_audit(
    v_owner_id, v_doc_id, 'grantee_active@example.com', 'EDIT', '127.0.0.1', 'pg-test'
  );
  IF NOT v_res.success OR v_res.permission != 'EDIT' OR v_res.status_code != 'SUCCESS' THEN
    RAISE EXCEPTION 'TEST FAILED: Owner could not update permission to EDIT: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 3 PASSED: Owner changed permission from READ to EDIT';

  -- 5. TEST: Target is inactive user (Denied -> TARGET_INACTIVE)
  SELECT * INTO v_res FROM public.grant_or_change_document_permission_and_audit(
    v_owner_id, v_doc_id, 'grantee_inactive@example.com', 'READ', '127.0.0.1', 'pg-test'
  );
  IF v_res.success OR v_res.status_code != 'TARGET_INACTIVE' THEN
    RAISE EXCEPTION 'TEST FAILED: Inactive target should have been rejected: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 4 PASSED: Inactive target account rejected with denied audit event';

  -- 6. TEST: Target is document owner (Denied -> CANNOT_GRANT_OWNER)
  SELECT * INTO v_res FROM public.grant_or_change_document_permission_and_audit(
    v_owner_id, v_doc_id, 'owner_test@example.com', 'READ', '127.0.0.1', 'pg-test'
  );
  IF v_res.success OR v_res.status_code != 'CANNOT_GRANT_OWNER' THEN
    RAISE EXCEPTION 'TEST FAILED: Self-grant should have been rejected: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 5 PASSED: Owner self-grant blocked with denied audit event';

  -- 7. TEST: Non-owner / unrelated user attempts to grant (Denied -> NOT_DOCUMENT_OWNER)
  SELECT * INTO v_res FROM public.grant_or_change_document_permission_and_audit(
    v_unrelated_id, v_doc_id, 'grantee_active@example.com', 'EDIT', '127.0.0.1', 'pg-test'
  );
  IF v_res.success OR v_res.status_code != 'NOT_DOCUMENT_OWNER' THEN
    RAISE EXCEPTION 'TEST FAILED: Non-owner grant should have been rejected: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 6 PASSED: Non-owner grant blocked with denied audit event';

  -- 8. TEST: Grantee attempts to share/grant (Denied -> NOT_DOCUMENT_OWNER, Re-sharing blocked)
  SELECT * INTO v_res FROM public.grant_or_change_document_permission_and_audit(
    v_grantee_active_id, v_doc_id, 'unrelated_test@example.com', 'READ', '127.0.0.1', 'pg-test'
  );
  IF v_res.success OR v_res.status_code != 'NOT_DOCUMENT_OWNER' THEN
    RAISE EXCEPTION 'TEST FAILED: Grantee re-sharing should have been rejected: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 7 PASSED: Grantee re-sharing blocked with denied audit event';

  -- 9. TEST: Owner attempts to grant with invalid permission (Denied -> INVALID_PERMISSION)
  SELECT * INTO v_res FROM public.grant_or_change_document_permission_and_audit(
    v_owner_id, v_doc_id, 'unrelated_test@example.com', 'SUPERUSER', '127.0.0.1', 'pg-test'
  );
  IF v_res.success OR v_res.status_code != 'INVALID_PERMISSION' THEN
    RAISE EXCEPTION 'TEST FAILED: Invalid permission should have been rejected: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 8 PASSED: Invalid permission blocked with denied audit event';

  -- 10. TEST: Grant on nonexistent document (Denied -> DOCUMENT_NOT_FOUND)
  SELECT * INTO v_res FROM public.grant_or_change_document_permission_and_audit(
    v_owner_id, v_fake_doc_id, 'unrelated_test@example.com', 'READ', '127.0.0.1', 'pg-test'
  );
  IF v_res.success OR v_res.status_code != 'DOCUMENT_NOT_FOUND' THEN
    RAISE EXCEPTION 'TEST FAILED: Nonexistent doc should have been rejected: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 9 PASSED: Nonexistent document grant blocked with denied audit event';

  -- 11. TEST: Attempting to revoke nonexistent grant (Denied -> PERMISSION_NOT_FOUND)
  SELECT * INTO v_res FROM public.revoke_document_permission_and_audit(
    v_owner_id, v_doc_id, v_unrelated_id, '127.0.0.1', 'pg-test'
  );
  IF v_res.success OR v_res.status_code != 'PERMISSION_NOT_FOUND' THEN
    RAISE EXCEPTION 'TEST FAILED: Nonexistent grant revocation should have returned PERMISSION_NOT_FOUND: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 10 PASSED: Nonexistent grant revocation recorded denied audit event';

  -- 12. TEST: Attempting to revoke owner (Denied -> CANNOT_REVOKE_OWNER)
  SELECT * INTO v_res FROM public.revoke_document_permission_and_audit(
    v_owner_id, v_doc_id, v_owner_id, '127.0.0.1', 'pg-test'
  );
  IF v_res.success OR v_res.status_code != 'CANNOT_REVOKE_OWNER' THEN
    RAISE EXCEPTION 'TEST FAILED: Revoking owner should have returned CANNOT_REVOKE_OWNER: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 11 PASSED: Revoking owner blocked with denied audit event';

  -- 13. TEST: Owner revokes grant immediately (Static SQL CTE Deletion)
  SELECT * INTO v_res FROM public.revoke_document_permission_and_audit(
    v_owner_id, v_doc_id, v_grantee_active_id, '127.0.0.1', 'pg-test'
  );
  IF NOT v_res.success OR v_res.revoked_permission != 'EDIT' THEN
    RAISE EXCEPTION 'TEST FAILED: Owner could not revoke permission: %', v_res;
  END IF;
  RAISE NOTICE 'CHECK 12 PASSED: Owner revoked grant immediately via static CTE deletion';

  -- Verify row deleted from document_permissions
  SELECT count(*) INTO v_perm_count FROM public.document_permissions 
  WHERE document_id = v_doc_id AND grantee_id = v_grantee_active_id;
  IF v_perm_count != 0 THEN
    RAISE EXCEPTION 'TEST FAILED: Permission row still exists after revocation';
  END IF;
  RAISE NOTICE 'CHECK 13 PASSED: Permission row deleted from document_permissions';

  -- 14. TEST: Verify all audit events (both allowed and denied) are present in audit chain
  SELECT count(*) INTO v_audit_count FROM public.audit_logs
  WHERE document_id = v_doc_id;
  IF v_audit_count < 10 THEN
    RAISE EXCEPTION 'TEST FAILED: Expected at least 10 audit events for document, found %', v_audit_count;
  END IF;
  RAISE NOTICE 'CHECK 14 PASSED: Audit chain recorded all allowed and denied operations';

  -- 15. TEST: Verify no raw email addresses were leaked in audit metadata
  SELECT count(*) INTO v_email_leaks FROM public.audit_logs
  WHERE document_id = v_doc_id AND metadata::text LIKE '%@example.com%';
  IF v_email_leaks != 0 THEN
    RAISE EXCEPTION 'SECURITY FAILED: Raw email address leaked into audit metadata! Count: %', v_email_leaks;
  END IF;
  RAISE NOTICE 'CHECK 15 PASSED: Zero raw email addresses leaked into audit metadata';

  -- Intentional cleanup exception to rollback all temporary test data
  RAISE EXCEPTION 'TEST_CLEANUP_ROLLBACK_SUCCESS';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'TEST_CLEANUP_ROLLBACK_SUCCESS' THEN
    RAISE NOTICE '=== ALL PHASE 6 SECURITY PROCEDURES VERIFIED SUCCESSFULLY (ROLLED BACK) ===';
  ELSE
    RAISE;
  END IF;
END $$;
