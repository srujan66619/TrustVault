-- ============================================================================
-- TrustVault — Phase 8 Live Security Verification Script
-- File: supabase/verify_phase8_security.sql
-- Description:
--   Runs comprehensive security checks on Phase 8 audit history and verification:
--   1. Direct SELECT/write privileges revoked from anon and authenticated on audit_logs.
--   2. Routine execution privileges granted exclusively to service_role.
--   3. Owner can query get_document_audit_history for owned documents.
--   4. Grantees (READ/EDIT) and unrelated users receive 0 rows from get_document_audit_history.
--   5. Disabled users receive 0 rows.
--   6. Soft-deleted documents return 0 rows.
--   7. Owner-scoped accessible audit history returns only documents owned by the caller.
--   8. Non-admin caller is rejected from get_admin_global_audit_activity.
--   9. Admin caller receives global activity from get_admin_global_audit_activity.
--  10. Non-admin caller is rejected from get_admin_audit_chain_summary.
--  11. Admin caller receives valid summary from get_admin_audit_chain_summary.
--  All write/mutation tests execute inside a single transaction ending in ROLLBACK.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS phase8_test_results (
    test_num integer PRIMARY KEY,
    test_name text NOT NULL,
    status text NOT NULL,
    details text NOT NULL
);

DO $$
DECLARE
    v_anon_privs integer;
    v_auth_privs integer;
    v_sr_non_select integer;
    v_sr_select integer;
    v_public_proc_privs integer;
    v_sr_proc_privs integer;

    v_admin_id uuid := gen_random_uuid();
    v_owner_id uuid := gen_random_uuid();
    v_grantee_id uuid := gen_random_uuid();
    v_unrelated_id uuid := gen_random_uuid();
    v_disabled_id uuid := gen_random_uuid();

    v_doc1_id uuid := gen_random_uuid();
    v_doc2_id uuid := gen_random_uuid();
    v_deleted_doc_id uuid := gen_random_uuid();

    v_count integer;
    v_exception_caught boolean;
    v_summary RECORD;
BEGIN
    -- ========================================================================
    -- CHECK 1: Table Privileges on public.audit_logs
    -- ========================================================================
    SELECT count(*) INTO v_anon_privs
    FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND grantee = 'anon';

    SELECT count(*) INTO v_auth_privs
    FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND grantee = 'authenticated';

    SELECT count(*) INTO v_sr_non_select
    FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'audit_logs' 
      AND grantee = 'service_role' AND privilege_type != 'SELECT';

    SELECT count(*) INTO v_sr_select
    FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'audit_logs' 
      AND grantee = 'service_role' AND privilege_type = 'SELECT';

    IF v_anon_privs = 0 AND v_auth_privs = 0 AND v_sr_non_select = 0 AND v_sr_select = 1 THEN
        INSERT INTO phase8_test_results VALUES (1, 'audit_logs table privileges lockdown', 'PASSED',
            'anon=0, authenticated=0, service_role strictly SELECT');
    ELSE
        INSERT INTO phase8_test_results VALUES (1, 'audit_logs table privileges lockdown', 'FAILED',
            format('anon=%s, auth=%s, sr_non_select=%s, sr_select=%s', v_anon_privs, v_auth_privs, v_sr_non_select, v_sr_select));
    END IF;

    -- ========================================================================
    -- CHECK 2: Routine Execution Privileges
    -- ========================================================================
    SELECT count(*) INTO v_public_proc_privs
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' 
      AND routine_name IN ('get_document_audit_history', 'get_owner_audit_history', 'get_admin_global_audit_activity', 'get_admin_audit_chain_summary')
      AND grantee IN ('PUBLIC', 'anon', 'authenticated');

    SELECT count(*) INTO v_sr_proc_privs
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' 
      AND routine_name IN ('get_document_audit_history', 'get_owner_audit_history', 'get_admin_global_audit_activity', 'get_admin_audit_chain_summary')
      AND grantee = 'service_role';

    IF v_public_proc_privs = 0 AND v_sr_proc_privs = 4 THEN
        INSERT INTO phase8_test_results VALUES (2, 'audit query procedures least-privilege execute', 'PASSED',
            'PUBLIC/anon/authenticated=0, service_role=4 procedures');
    ELSE
        INSERT INTO phase8_test_results VALUES (2, 'audit query procedures least-privilege execute', 'FAILED',
            format('public/anon/auth=%s, service_role=%s', v_public_proc_privs, v_sr_proc_privs));
    END IF;

    -- ========================================================================
    -- SETUP TEST FIXTURES
    -- ========================================================================
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at) VALUES
        (v_admin_id, 'phase8_admin@example.com', '{}'::jsonb, now(), now()),
        (v_owner_id, 'phase8_owner@example.com', '{}'::jsonb, now(), now()),
        (v_grantee_id, 'phase8_grantee@example.com', '{}'::jsonb, now(), now()),
        (v_unrelated_id, 'phase8_unrelated@example.com', '{}'::jsonb, now(), now()),
        (v_disabled_id, 'phase8_disabled@example.com', '{}'::jsonb, now(), now());

    UPDATE public.profiles SET role = 'ADMIN', status = 'ACTIVE' WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'OWNER', status = 'ACTIVE' WHERE id = v_owner_id;
    UPDATE public.profiles SET role = 'VIEWER', status = 'ACTIVE' WHERE id = v_grantee_id;
    UPDATE public.profiles SET role = 'OWNER', status = 'ACTIVE' WHERE id = v_unrelated_id;
    UPDATE public.profiles SET role = 'OWNER', status = 'DISABLED' WHERE id = v_disabled_id;

    INSERT INTO public.documents (id, owner_id, storage_object_key, display_name, size_bytes, content_type, category) VALUES
        (v_doc1_id, v_owner_id, gen_random_uuid(), 'Doc1.pdf', 1024, 'application/pdf', 'financial'),
        (v_doc2_id, v_unrelated_id, gen_random_uuid(), 'Doc2.pdf', 2048, 'application/pdf', 'legal'),
        (v_deleted_doc_id, v_owner_id, gen_random_uuid(), 'Deleted.pdf', 512, 'application/pdf', 'general');

    UPDATE public.documents SET deleted_at = now() WHERE id = v_deleted_doc_id;

    INSERT INTO public.document_permissions (document_id, owner_id, grantee_id, permission) VALUES
        (v_doc1_id, v_owner_id, v_grantee_id, 'READ');

    -- Insert mock audit events via internal append
    PERFORM public.append_audit_log(v_owner_id, v_doc1_id, 'DOCUMENT_CREATE', 'SUCCESS', '{"scope":"test"}'::jsonb, '127.0.0.1', 'test-agent');
    PERFORM public.append_audit_log(v_grantee_id, v_doc1_id, 'READ', 'SUCCESS', '{"scope":"test"}'::jsonb, '127.0.0.1', 'test-agent');
    PERFORM public.append_audit_log(v_unrelated_id, v_doc2_id, 'DOCUMENT_CREATE', 'SUCCESS', '{"scope":"test"}'::jsonb, '127.0.0.1', 'test-agent');

    -- ========================================================================
    -- CHECK 3: Document Owner Can Query get_document_audit_history
    -- ========================================================================
    SELECT count(*) INTO v_count
    FROM public.get_document_audit_history(v_owner_id, v_doc1_id);

    IF v_count >= 2 THEN
        INSERT INTO phase8_test_results VALUES (3, 'owner queries get_document_audit_history', 'PASSED',
            format('Returned %s matching records for document owner', v_count));
    ELSE
        INSERT INTO phase8_test_results VALUES (3, 'owner queries get_document_audit_history', 'FAILED',
            format('Expected >= 2, got %s', v_count));
    END IF;

    -- ========================================================================
    -- CHECK 4: Grantee (READ) Receives 0 Rows from get_document_audit_history
    -- ========================================================================
    SELECT count(*) INTO v_count
    FROM public.get_document_audit_history(v_grantee_id, v_doc1_id);

    IF v_count = 0 THEN
        INSERT INTO phase8_test_results VALUES (4, 'grantee denied get_document_audit_history', 'PASSED',
            'Grantee receives 0 rows (anti-enumeration & privacy)');
    ELSE
        INSERT INTO phase8_test_results VALUES (4, 'grantee denied get_document_audit_history', 'FAILED',
            format('Expected 0 rows for grantee, got %s', v_count));
    END IF;

    -- ========================================================================
    -- CHECK 5: Unrelated User Receives 0 Rows from get_document_audit_history
    -- ========================================================================
    SELECT count(*) INTO v_count
    FROM public.get_document_audit_history(v_unrelated_id, v_doc1_id);

    IF v_count = 0 THEN
        INSERT INTO phase8_test_results VALUES (5, 'unrelated user denied get_document_audit_history', 'PASSED',
            'Unrelated user receives 0 rows');
    ELSE
        INSERT INTO phase8_test_results VALUES (5, 'unrelated user denied get_document_audit_history', 'FAILED',
            format('Expected 0 rows for unrelated user, got %s', v_count));
    END IF;

    -- ========================================================================
    -- CHECK 6: Disabled User Receives 0 Rows
    -- ========================================================================
    SELECT count(*) INTO v_count
    FROM public.get_document_audit_history(v_disabled_id, v_doc1_id);

    IF v_count = 0 THEN
        INSERT INTO phase8_test_results VALUES (6, 'disabled user denied get_document_audit_history', 'PASSED',
            'Disabled user receives 0 rows');
    ELSE
        INSERT INTO phase8_test_results VALUES (6, 'disabled user denied get_document_audit_history', 'FAILED',
            format('Expected 0 rows for disabled user, got %s', v_count));
    END IF;

    -- ========================================================================
    -- CHECK 7: Soft-Deleted Document Returns 0 Rows
    -- ========================================================================
    SELECT count(*) INTO v_count
    FROM public.get_document_audit_history(v_owner_id, v_deleted_doc_id);

    IF v_count = 0 THEN
        INSERT INTO phase8_test_results VALUES (7, 'soft-deleted document returns 0 rows', 'PASSED',
            'Soft-deleted document history completely masked');
    ELSE
        INSERT INTO phase8_test_results VALUES (7, 'soft-deleted document returns 0 rows', 'FAILED',
            format('Expected 0 rows for soft-deleted doc, got %s', v_count));
    END IF;

    -- ========================================================================
    -- CHECK 8: get_owner_audit_history Scoped Strictly to Owned Documents
    -- ========================================================================
    SELECT count(*) INTO v_count
    FROM public.get_owner_audit_history(v_owner_id);

    -- Should only include doc1 events, NOT doc2 (which is owned by v_unrelated_id)
    IF v_count >= 2 THEN
        SELECT count(*) INTO v_count
        FROM public.get_owner_audit_history(v_owner_id, 50, 0, v_doc2_id);

        IF v_count = 0 THEN
            INSERT INTO phase8_test_results VALUES (8, 'owner audit history strictly scoped', 'PASSED',
                'Owner sees their own documents and 0 rows for foreign documents');
        ELSE
            INSERT INTO phase8_test_results VALUES (8, 'owner audit history strictly scoped', 'FAILED',
                format('Foreign document leaked %s rows to owner', v_count));
        END IF;
    ELSE
        INSERT INTO phase8_test_results VALUES (8, 'owner audit history strictly scoped', 'FAILED',
            format('Expected >= 2 rows for owner documents, got %s', v_count));
    END IF;

    -- ========================================================================
    -- CHECK 9: Non-Admin Rejected from get_admin_global_audit_activity
    -- ========================================================================
    v_exception_caught := false;
    BEGIN
        PERFORM * FROM public.get_admin_global_audit_activity(v_owner_id);
    EXCEPTION WHEN OTHERS THEN
        v_exception_caught := true;
    END;

    IF v_exception_caught THEN
        INSERT INTO phase8_test_results VALUES (9, 'non-admin rejected from global activity', 'PASSED',
            'Non-admin raised exception as expected');
    ELSE
        INSERT INTO phase8_test_results VALUES (9, 'non-admin rejected from global activity', 'FAILED',
            'Non-admin did not raise exception from get_admin_global_audit_activity');
    END IF;

    -- ========================================================================
    -- CHECK 10: Admin Receives Global Activity with Safe Projection
    -- ========================================================================
    SELECT count(*) INTO v_count
    FROM public.get_admin_global_audit_activity(v_admin_id);

    IF v_count >= 3 THEN
        INSERT INTO phase8_test_results VALUES (10, 'admin accesses global activity', 'PASSED',
            format('Admin successfully retrieved %s global audit records', v_count));
    ELSE
        INSERT INTO phase8_test_results VALUES (10, 'admin accesses global activity', 'FAILED',
            format('Expected >= 3 global audit records, got %s', v_count));
    END IF;

    -- ========================================================================
    -- CHECK 11: Non-Admin Rejected from get_admin_audit_chain_summary
    -- ========================================================================
    v_exception_caught := false;
    BEGIN
        PERFORM * FROM public.get_admin_audit_chain_summary(v_owner_id);
    EXCEPTION WHEN OTHERS THEN
        v_exception_caught := true;
    END;

    IF v_exception_caught THEN
        INSERT INTO phase8_test_results VALUES (11, 'non-admin rejected from chain summary', 'PASSED',
            'Non-admin raised exception as expected');
    ELSE
        INSERT INTO phase8_test_results VALUES (11, 'non-admin rejected from chain summary', 'FAILED',
            'Non-admin did not raise exception from get_admin_audit_chain_summary');
    END IF;

    -- ========================================================================
    -- CHECK 12: Admin Receives Valid Chain Summary
    -- ========================================================================
    SELECT * INTO v_summary
    FROM public.get_admin_audit_chain_summary(v_admin_id);

    IF v_summary.is_valid = true AND v_summary.total_verified > 0 THEN
        INSERT INTO phase8_test_results VALUES (12, 'admin receives valid chain summary', 'PASSED',
            format('Chain verified valid across %s records', v_summary.total_verified));
    ELSE
        INSERT INTO phase8_test_results VALUES (12, 'admin receives valid chain summary', 'FAILED',
            format('Chain is_valid=%s, verified=%s', v_summary.is_valid, v_summary.total_verified));
    END IF;

END $$;

SELECT test_num, test_name, status, details FROM phase8_test_results ORDER BY test_num;

ROLLBACK;
