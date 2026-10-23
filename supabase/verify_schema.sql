-- ==============================================================================
-- TrustVault — Comprehensive RLS & Schema Verification Suite
-- File: supabase/verify_schema.sql
-- Description: Executes multi-role RLS checks (anon, unrelated, owner, viewer,
--              disabled, admin), cross-table constraints, owner-role enforcement,
--              client document mutation denial, and audit immutability triggers.
-- Instructions: Run this entire script in your Supabase Project SQL Editor.
-- ==============================================================================

-- 0. PREREQUISITE CHECK
-- Ensure migration 20261021000000_secure_schema_baseline.sql was executed first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_active_user'
  ) THEN
    RAISE EXCEPTION 'Prerequisite missing: function public.is_active_user() not found. You must run supabase/migrations/20261021000000_secure_schema_baseline.sql in the Supabase SQL Editor BEFORE running verify_schema.sql.';
  END IF;
END;
$$;

BEGIN;

-- Transaction-local temporary table for structured verification output
CREATE TEMP TABLE test_results (
  test_name text PRIMARY KEY,
  status text NOT NULL,
  details text NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  v_admin_id uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_grantee_id uuid := gen_random_uuid();
  v_unrelated_id uuid := gen_random_uuid();
  v_disabled_id uuid := gen_random_uuid();
  v_doc_id uuid := gen_random_uuid();
  v_audit_id uuid := gen_random_uuid();
  v_count integer;
  v_caught boolean;
BEGIN
  -- ----------------------------------------------------------------------------
  -- 1. SETUP: Seed Test Users in auth.users (satisfying profiles_id_fkey)
  -- ----------------------------------------------------------------------------
  -- The on_auth_user_created trigger automatically provisions profiles with
  -- role='VIEWER' and status='ACTIVE'.
  INSERT INTO auth.users (
    id, aud, role, email, email_confirmed_at, created_at, updated_at
  ) VALUES 
    (v_admin_id, 'authenticated', 'authenticated', 'admin_' || v_admin_id || '@trustvault.test', now(), now(), now()),
    (v_owner_id, 'authenticated', 'authenticated', 'owner_' || v_owner_id || '@trustvault.test', now(), now(), now()),
    (v_grantee_id, 'authenticated', 'authenticated', 'grantee_' || v_grantee_id || '@trustvault.test', now(), now(), now()),
    (v_unrelated_id, 'authenticated', 'authenticated', 'unrelated_' || v_unrelated_id || '@trustvault.test', now(), now(), now()),
    (v_disabled_id, 'authenticated', 'authenticated', 'disabled_' || v_disabled_id || '@trustvault.test', now(), now(), now());

  -- As database superuser (postgres), configure role and status for test actors:
  UPDATE public.profiles SET role = 'ADMIN' WHERE id = v_admin_id;
  UPDATE public.profiles SET role = 'OWNER' WHERE id = v_owner_id;
  UPDATE public.profiles SET status = 'DISABLED' WHERE id = v_disabled_id;

  -- ----------------------------------------------------------------------------
  -- 2. CONSTRAINT & TRIGGER INVARIANT CHECKS (Run as postgres)
  -- ----------------------------------------------------------------------------
  -- Check A: Role Enforcement - VIEWER cannot own a document
  v_caught := false;
  BEGIN
    INSERT INTO public.documents (
      owner_id, display_name, category, content_type, size_bytes
    ) VALUES (
      v_grantee_id, 'invalid_viewer_owned.pdf', 'finance', 'application/pdf', 1024
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  INSERT INTO test_results VALUES (
    'Constraint: Viewer Cannot Own Document',
    CASE WHEN v_caught THEN 'PASSED' ELSE 'FAILED' END,
    'Trigger trg_check_document_owner_role rejected non-OWNER/non-ADMIN owner_id'
  );

  -- Seed valid document owned by v_owner_id
  INSERT INTO public.documents (
    id, owner_id, display_name, category, content_type, size_bytes
  ) VALUES (
    v_doc_id, v_owner_id, 'q3_financial_report.pdf', 'finance', 'application/pdf', 2048
  );

  -- Seed permissions
  INSERT INTO public.document_permissions (document_id, grantee_id, permission)
  VALUES (v_doc_id, v_grantee_id, 'READ');
  
  INSERT INTO public.document_permissions (document_id, grantee_id, permission)
  VALUES (v_doc_id, v_disabled_id, 'READ');

  -- Seed initial audit log record
  INSERT INTO public.audit_logs (
    id, actor_id, document_id, action, result, metadata
  ) VALUES (
    v_audit_id, v_owner_id, v_doc_id, 'DOCUMENT_CREATE', 'SUCCESS', '{"test": true}'::jsonb
  );

  -- Check B: Duplicate Grant Prevention
  v_caught := false;
  BEGIN
    INSERT INTO public.document_permissions (document_id, grantee_id, permission)
    VALUES (v_doc_id, v_grantee_id, 'EDIT');
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
  END;
  INSERT INTO test_results VALUES (
    'Constraint: Duplicate Grant Blocked',
    CASE WHEN v_caught THEN 'PASSED' ELSE 'FAILED' END,
    'Unique constraint uq_document_grantee prevented duplicate grant'
  );

  -- Check C: Owner-as-Grantee Prevention
  v_caught := false;
  BEGIN
    INSERT INTO public.document_permissions (document_id, grantee_id, permission)
    VALUES (v_doc_id, v_owner_id, 'READ');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  INSERT INTO test_results VALUES (
    'Constraint: Owner-as-Grantee Blocked',
    CASE WHEN v_caught THEN 'PASSED' ELSE 'FAILED' END,
    'Trigger trg_check_grantee_not_owner rejected adding owner as grantee'
  );

  -- Check D: Audit Log UPDATE Immutability
  v_caught := false;
  BEGIN
    UPDATE public.audit_logs SET action = 'ALTERED' WHERE id = v_audit_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  INSERT INTO test_results VALUES (
    'Audit Log: UPDATE Mutation Blocked',
    CASE WHEN v_caught THEN 'PASSED' ELSE 'FAILED' END,
    'Row trigger trg_prevent_audit_log_mutation raised exception on UPDATE'
  );

  -- Check E: Audit Log DELETE Immutability
  v_caught := false;
  BEGIN
    DELETE FROM public.audit_logs WHERE id = v_audit_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  INSERT INTO test_results VALUES (
    'Audit Log: DELETE Mutation Blocked',
    CASE WHEN v_caught THEN 'PASSED' ELSE 'FAILED' END,
    'Row trigger trg_prevent_audit_log_mutation raised exception on DELETE'
  );

  -- Check F: Audit Log TRUNCATE Immutability
  v_caught := false;
  BEGIN
    TRUNCATE public.audit_logs;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  INSERT INTO test_results VALUES (
    'Audit Log: TRUNCATE Operation Blocked',
    CASE WHEN v_caught THEN 'PASSED' ELSE 'FAILED' END,
    'Statement trigger trg_prevent_audit_log_truncate raised exception on TRUNCATE'
  );

  -- Check G: Profile Privilege Escalation
  v_caught := false;
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    UPDATE public.profiles SET role = 'ADMIN' WHERE id = v_grantee_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'Profiles: Direct Role Escalation Blocked',
    CASE WHEN v_caught THEN 'PASSED' ELSE 'FAILED' END,
    'Trigger trg_prevent_profile_privilege_escalation rejected client role change'
  );

  -- ----------------------------------------------------------------------------
  -- 3. RLS CONTEXT TESTS (Role Simulation)
  -- ----------------------------------------------------------------------------

  -- TEST 1: Anonymous User Context
  EXECUTE 'SET ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  SELECT count(*) INTO v_count FROM public.documents;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Anon Cannot View Documents',
    CASE WHEN v_count = 0 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 0 documents, visible: %s', v_count)
  );

  EXECUTE 'SET ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  SELECT count(*) INTO v_count FROM public.audit_logs;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Anon Cannot View Audit Logs',
    CASE WHEN v_count = 0 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 0 audit logs, visible: %s', v_count)
  );

  -- TEST 2: Document Owner Context (Verifying SELECT allowed, but client writes DENIED)
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.documents WHERE id = v_doc_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Owner Can View Own Document',
    CASE WHEN v_count = 1 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 1 document, visible: %s', v_count)
  );

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.document_permissions WHERE document_id = v_doc_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Owner Can View Document Permissions',
    CASE WHEN v_count >= 1 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected >=1 permission rows, visible: %s', v_count)
  );

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.audit_logs WHERE document_id = v_doc_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Owner Can View Own Document Audit Logs',
    CASE WHEN v_count = 1 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 1 audit row, visible: %s', v_count)
  );

  -- Owner direct document INSERT denied
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_caught := false;
  BEGIN
    INSERT INTO public.documents (
      owner_id, display_name, category, content_type, size_bytes
    ) VALUES (
      v_owner_id, 'direct_client_insert.pdf', 'general', 'application/pdf', 512
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Client Direct Document INSERT Denied',
    CASE WHEN v_caught THEN 'PASSED' ELSE 'FAILED' END,
    'Direct client INSERT on documents rejected (creation must be server-mediated)'
  );

  -- Owner direct document UPDATE denied
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_caught := false;
  BEGIN
    UPDATE public.documents SET display_name = 'tampered_title.pdf' WHERE id = v_doc_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  SELECT count(*) INTO v_count FROM public.documents WHERE id = v_doc_id AND display_name = 'tampered_title.pdf';
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Client Direct Document UPDATE Denied',
    CASE WHEN v_caught OR v_count = 0 THEN 'PASSED' ELSE 'FAILED' END,
    'Direct client UPDATE on documents rejected (updates must be server-mediated)'
  );

  -- Owner direct permission INSERT denied
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_caught := false;
  BEGIN
    INSERT INTO public.document_permissions (document_id, grantee_id, permission)
    VALUES (v_doc_id, v_unrelated_id, 'READ');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Client Direct Permission INSERT Denied',
    CASE WHEN v_caught THEN 'PASSED' ELSE 'FAILED' END,
    'Direct client INSERT on document_permissions rejected (grants must be server-mediated)'
  );

  -- TEST 3: Grantee Context
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_grantee_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.documents WHERE id = v_doc_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Grantee Can View Granted Document',
    CASE WHEN v_count = 1 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 1 document, visible: %s', v_count)
  );

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_grantee_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.document_permissions WHERE grantee_id = v_grantee_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Grantee Can View Own Permission Record',
    CASE WHEN v_count = 1 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 1 permission record, visible: %s', v_count)
  );

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_grantee_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.audit_logs WHERE document_id = v_doc_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Grantee Denied Document Audit Logs',
    CASE WHEN v_count = 0 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 0 audit rows for grantee, visible: %s', v_count)
  );

  -- TEST 4: Unrelated Context
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_unrelated_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.documents;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Unrelated User Cannot View Document',
    CASE WHEN v_count = 0 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 0 documents, visible: %s', v_count)
  );

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_unrelated_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.audit_logs;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Unrelated User Cannot View Audit Logs',
    CASE WHEN v_count = 0 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 0 audit logs, visible: %s', v_count)
  );

  -- TEST 5: Disabled User Context
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_disabled_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.documents WHERE id = v_doc_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Disabled User Denied Document Access',
    CASE WHEN v_count = 0 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 0 documents (user is DISABLED), visible: %s', v_count)
  );

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_disabled_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.document_permissions WHERE grantee_id = v_disabled_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Disabled User Denied Permission Access',
    CASE WHEN v_count = 0 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected 0 permission rows (user is DISABLED), visible: %s', v_count)
  );

  -- TEST 6: Admin Context
  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.audit_logs;
  EXECUTE 'RESET ROLE';
  INSERT INTO test_results VALUES (
    'RLS: Admin Can View All Audit Logs',
    CASE WHEN v_count >= 1 THEN 'PASSED' ELSE 'FAILED' END,
    format('Expected >=1 audit rows for admin, visible: %s', v_count)
  );

  EXECUTE 'RESET ROLE';
END;
$$;

SELECT 
  test_name AS "Security Verification Test",
  status AS "Result",
  details AS "Verification Details"
FROM test_results;

ROLLBACK;
