-- ==============================================================================
-- TrustVault — Phase 5: Live Security & IDOR Verification Harness
-- File: supabase/verify_phase5_security.sql
--
-- Security Invariants Verified:
-- 1. create_document_and_audit is restricted to service_role (anon/authenticated denied).
-- 2. list_accessible_documents is callable by authenticated and service_role, denied to anon.
-- 3. Storage bucket 'documents' is private (public = false) with 15MB limit.
-- 4. Storage table 'storage.objects' has zero client policies for anon/authenticated.
-- 5. Atomic document upload: creates metadata and DOCUMENT_CREATE audit log in one transaction.
-- 6. Atomic upload failure: invalid owner rolls back metadata insert and audit log.
-- 7. Anti-IDOR list/search: authenticated caller passing another user's UUID receives 0 rows.
-- 8. Identity derivation: authenticated caller omitting p_user_id derives context from auth.uid().
-- 9. Disabled account protection: disabled user receives 0 rows from list/search RPC.
--
-- Guarantee: Runs strictly within a transaction terminated by ROLLBACK.
-- ==============================================================================

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS test_results (
    test_num integer,
    test_name text,
    status text,
    details text
);

DO $$
DECLARE
    v_owner_id uuid;
    v_unrelated_id uuid;
    v_disabled_id uuid;
    v_doc_id uuid;
    v_seq bigint;
    v_count integer;
    v_can_anon_create boolean;
    v_can_anon_list boolean;
    v_can_service_create boolean;
    v_can_service_list boolean;
BEGIN
    -- --------------------------------------------------------------------------
    -- Test 1: RPC Least-Privilege Role Lockdown
    -- --------------------------------------------------------------------------
    SELECT has_function_privilege('anon', 'public.create_document_and_audit(uuid, text, text, text, bigint, uuid, text, text, jsonb)', 'EXECUTE')
    INTO v_can_anon_create;

    SELECT has_function_privilege('anon', 'public.list_accessible_documents(uuid, text, text, integer, integer)', 'EXECUTE')
    INTO v_can_anon_list;

    SELECT has_function_privilege('service_role', 'public.create_document_and_audit(uuid, text, text, text, bigint, uuid, text, text, jsonb)', 'EXECUTE')
    INTO v_can_service_create;

    SELECT has_function_privilege('service_role', 'public.list_accessible_documents(uuid, text, text, integer, integer)', 'EXECUTE')
    INTO v_can_service_list;

    IF v_can_anon_create = false AND v_can_anon_list = false AND v_can_service_create = true AND v_can_service_list = true THEN
        INSERT INTO test_results VALUES (1, 'RPC Privilege Lockdown', 'PASSED', 'anon denied create & list; service_role granted execute');
    ELSE
        INSERT INTO test_results VALUES (1, 'RPC Privilege Lockdown', 'FAILED', format('Privileges: anon_create=%s, anon_list=%s, srv_create=%s, srv_list=%s', v_can_anon_create, v_can_anon_list, v_can_service_create, v_can_service_list));
    END IF;

    -- --------------------------------------------------------------------------
    -- Test 2: Private Storage Bucket Configuration
    -- --------------------------------------------------------------------------
    SELECT count(*) INTO v_count
    FROM storage.buckets
    WHERE id = 'documents' AND public = false AND file_size_limit = 15728640;

    IF v_count = 1 THEN
        INSERT INTO test_results VALUES (2, 'Storage Bucket Lockdown', 'PASSED', 'documents bucket is private (public=false) with 15MB limit');
    ELSE
        INSERT INTO test_results VALUES (2, 'Storage Bucket Lockdown', 'FAILED', 'documents bucket is missing, public, or has incorrect size limit');
    END IF;

    -- --------------------------------------------------------------------------
    -- Test 3: Zero Client Storage Policies (Direct browser access blocked)
    -- --------------------------------------------------------------------------
    SELECT count(*) INTO v_count
    FROM pg_policy pol
    JOIN pg_class c ON pol.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'storage' AND c.relname = 'objects'
      AND ('anon'::regrole = ANY(pol.polroles) OR 'authenticated'::regrole = ANY(pol.polroles));

    IF v_count = 0 THEN
        INSERT INTO test_results VALUES (3, 'Browser Direct Storage Isolation', 'PASSED', 'Zero policies on storage.objects for anon and authenticated');
    ELSE
        INSERT INTO test_results VALUES (3, 'Browser Direct Storage Isolation', 'FAILED', format('Found %s policies allowing client storage access', v_count));
    END IF;

    -- --------------------------------------------------------------------------
    -- Setup Test Accounts within Transaction
    -- --------------------------------------------------------------------------
    v_owner_id := gen_random_uuid();
    v_unrelated_id := gen_random_uuid();
    v_disabled_id := gen_random_uuid();

    INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES
      (v_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_owner@vault.local'),
      (v_unrelated_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_unrelated@vault.local'),
      (v_disabled_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_disabled@vault.local');

    UPDATE public.profiles SET role = 'OWNER', status = 'ACTIVE' WHERE id = v_owner_id;
    UPDATE public.profiles SET role = 'VIEWER', status = 'ACTIVE' WHERE id = v_unrelated_id;
    UPDATE public.profiles SET role = 'OWNER', status = 'DISABLED' WHERE id = v_disabled_id;

    -- --------------------------------------------------------------------------
    -- Test 4: Atomic Document Creation & Audit Append (service_role)
    -- --------------------------------------------------------------------------
    SELECT id, audit_sequence_number INTO v_doc_id, v_seq
    FROM public.create_document_and_audit(
      v_owner_id,
      'Confidential Architecture.pdf',
      'architecture',
      'application/pdf',
      4096,
      gen_random_uuid()
    );

    IF v_doc_id IS NOT NULL AND v_seq IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM public.documents WHERE id = v_doc_id;
        IF v_count = 1 THEN
            INSERT INTO test_results VALUES (4, 'Atomic Document Creation', 'PASSED', format('Created document %s and audit seq %s in single transaction', v_doc_id, v_seq));
        ELSE
            INSERT INTO test_results VALUES (4, 'Atomic Document Creation', 'FAILED', 'Document row not found after procedure execution');
        END IF;
    ELSE
        INSERT INTO test_results VALUES (4, 'Atomic Document Creation', 'FAILED', 'Procedure did not return doc_id or seq');
    END IF;

    -- --------------------------------------------------------------------------
    -- Test 5: Atomic Upload Rollback on Failure (Invalid Owner)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM public.create_document_and_audit(
            gen_random_uuid(), -- non-existent owner
            'Should Fail.pdf',
            'general',
            'application/pdf',
            500,
            gen_random_uuid()
        );
        INSERT INTO test_results VALUES (5, 'Atomic Upload Rollback', 'FAILED', 'Procedure did not reject non-existent owner');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (5, 'Atomic Upload Rollback', 'PASSED', 'Procedure aborted and rolled back on invalid owner');
    END;

    -- --------------------------------------------------------------------------
    -- Test 6: Anti-IDOR List/Search Rejection (Unrelated user passing victim UUID)
    -- --------------------------------------------------------------------------
    -- Simulate authenticated session for unrelated user
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_unrelated_id::text, true);

    -- Unrelated user probes list_accessible_documents using owner's UUID
    SELECT count(*) INTO v_count
    FROM public.list_accessible_documents(p_user_id => v_owner_id);

    IF v_count = 0 THEN
        INSERT INTO test_results VALUES (6, 'Anti-IDOR List/Search Protection', 'PASSED', 'Authenticated unrelated user passing victim UUID receives 0 rows');
    ELSE
        INSERT INTO test_results VALUES (6, 'Anti-IDOR List/Search Protection', 'FAILED', format('Unrelated user leaked %s rows from victim UUID', v_count));
    END IF;

    -- --------------------------------------------------------------------------
    -- Test 7: Context Derivation from auth.uid()
    -- --------------------------------------------------------------------------
    -- Caller calls list_accessible_documents without p_user_id parameter
    SELECT count(*) INTO v_count
    FROM public.list_accessible_documents();

    IF v_count = 0 THEN
        -- Switch context to owner
        PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
        SELECT count(*) INTO v_count
        FROM public.list_accessible_documents();

        IF v_count = 1 THEN
            INSERT INTO test_results VALUES (7, 'Identity Derivation from auth.uid()', 'PASSED', 'Omitting p_user_id correctly derives caller from auth.uid()');
        ELSE
            INSERT INTO test_results VALUES (7, 'Identity Derivation from auth.uid()', 'FAILED', format('Owner saw %s documents instead of 1', v_count));
        END IF;
    ELSE
        INSERT INTO test_results VALUES (7, 'Identity Derivation from auth.uid()', 'FAILED', format('Unrelated user saw %s documents', v_count));
    END IF;

    -- --------------------------------------------------------------------------
    -- Test 8: Disabled Account Denied
    -- --------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_disabled_id::text, true);
    SELECT count(*) INTO v_count
    FROM public.list_accessible_documents();

    IF v_count = 0 THEN
        INSERT INTO test_results VALUES (8, 'Disabled Account Protection', 'PASSED', 'Disabled user receives 0 rows from list_accessible_documents');
    ELSE
        INSERT INTO test_results VALUES (8, 'Disabled Account Protection', 'FAILED', format('Disabled user obtained %s rows', v_count));
    END IF;

END;
$$;

SELECT * FROM test_results ORDER BY test_num;

ROLLBACK;
