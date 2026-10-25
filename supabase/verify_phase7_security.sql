-- ============================================================================
-- Phase 7 Security Verification Suite: Document Dashboard, Metadata & Soft Delete
-- Run this inside a transaction that always rolls back.
-- Ensures least privilege, atomic audit logging, soft-delete isolation, and filter privacy.
-- ============================================================================
DO $$
DECLARE
    v_owner_id uuid := '10101010-1010-4010-8010-101010101010';
    v_edit_grantee_id uuid := '20202020-2020-4020-8020-202020202020';
    v_read_grantee_id uuid := '30303030-3030-4030-8030-303030303030';
    v_unrelated_id uuid := '40404040-4040-4040-8040-404040404040';
    v_inactive_id uuid := '50505050-5050-4050-8050-505050505050';

    v_doc1_id uuid := 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    v_doc2_id uuid := 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    v_storage_key1 uuid := 'cccccccc-3333-4333-8333-cccccccccccc';
    v_storage_key2 uuid := 'dddddddd-4444-4444-8444-dddddddddddd';

    v_audit_seq bigint;
    v_doc_record record;
    v_deleted_record record;
    v_audit_record record;
    v_count integer;
    v_has_privilege boolean;
BEGIN
    RAISE NOTICE '=== Starting Phase 7 Database Security Verification ===';

    -- ------------------------------------------------------------------------
    -- Check 1: Least-Privilege Table Lockdown on public.documents
    -- ------------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_privileges
        WHERE table_schema = 'public' AND table_name = 'documents'
          AND grantee IN ('anon', 'authenticated', 'service_role')
          AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    ) INTO v_has_privilege;

    IF v_has_privilege THEN
        RAISE EXCEPTION 'CHECK 1 FAILED: Direct INSERT, UPDATE, DELETE, or TRUNCATE on public.documents is still granted to untrusted/service roles';
    END IF;
    RAISE NOTICE 'CHECK 1 PASSED: Direct INSERT, UPDATE, DELETE, and TRUNCATE revoked from anon, authenticated, and service_role';

    -- ------------------------------------------------------------------------
    -- Check 2: Routine Execution Privilege Lockdown
    -- ------------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM information_schema.routine_privileges
        WHERE routine_schema = 'public'
          AND routine_name IN ('update_document_metadata_and_audit', 'soft_delete_document_and_audit')
          AND grantee IN ('anon', 'authenticated', 'PUBLIC')
          AND privilege_type = 'EXECUTE'
    ) INTO v_has_privilege;

    IF v_has_privilege THEN
        RAISE EXCEPTION 'CHECK 2 FAILED: Metadata update or soft-delete procedures are exposed to public/anon/authenticated';
    END IF;
    RAISE NOTICE 'CHECK 2 PASSED: Sensitive procedures restricted strictly to service_role and postgres';

    -- ------------------------------------------------------------------------
    -- Setup Test Fixtures (auth.users triggers profile creation, documents, permissions)
    -- ------------------------------------------------------------------------
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at) VALUES
        (v_owner_id, 'phase7_owner@example.com', '{}'::jsonb, now(), now()),
        (v_edit_grantee_id, 'phase7_edit@example.com', '{}'::jsonb, now(), now()),
        (v_read_grantee_id, 'phase7_read@example.com', '{}'::jsonb, now(), now()),
        (v_unrelated_id, 'phase7_unrelated@example.com', '{}'::jsonb, now(), now()),
        (v_inactive_id, 'phase7_inactive@example.com', '{}'::jsonb, now(), now());

    UPDATE public.profiles SET role = 'OWNER', status = 'ACTIVE' WHERE id = v_owner_id;
    UPDATE public.profiles SET role = 'VIEWER', status = 'ACTIVE' WHERE id = v_edit_grantee_id;
    UPDATE public.profiles SET role = 'VIEWER', status = 'ACTIVE' WHERE id = v_read_grantee_id;
    UPDATE public.profiles SET role = 'VIEWER', status = 'ACTIVE' WHERE id = v_unrelated_id;
    UPDATE public.profiles SET role = 'VIEWER', status = 'DISABLED' WHERE id = v_inactive_id;

    -- Insert initial documents directly for test fixture setup
    INSERT INTO public.documents (id, owner_id, display_name, category, content_type, size_bytes, storage_object_key) VALUES
        (v_doc1_id, v_owner_id, 'Q3 Quarterly Statement', 'financial', 'application/pdf', 10240, v_storage_key1),
        (v_doc2_id, v_owner_id, 'Private Secret Legal Brief', 'legal', 'application/pdf', 20480, v_storage_key2);

    -- Setup permissions: EDIT grantee on doc1, READ grantee on doc1; doc2 has NO grants (purely private)
    INSERT INTO public.document_permissions (document_id, grantee_id, owner_id, permission) VALUES
        (v_doc1_id, v_edit_grantee_id, v_owner_id, 'EDIT'),
        (v_doc1_id, v_read_grantee_id, v_owner_id, 'READ');

    -- ------------------------------------------------------------------------
    -- Check 3: Owner Updates Metadata -> SUCCESS & Audit Logged
    -- ------------------------------------------------------------------------
    SELECT * INTO v_doc_record FROM public.update_document_metadata_and_audit(
        v_owner_id,
        v_doc1_id,
        'Q3 Quarterly Statement Revised',
        'financial',
        '127.0.0.1',
        'Phase7Test/1.0'
    );

    IF v_doc_record.display_name <> 'Q3 Quarterly Statement Revised' THEN
        RAISE EXCEPTION 'CHECK 3 FAILED: Display name was not updated by owner';
    END IF;

    SELECT * INTO v_audit_record FROM public.audit_logs WHERE sequence_number = v_doc_record.audit_sequence_number;
    IF v_audit_record.action <> 'EDIT' OR v_audit_record.result <> 'SUCCESS' OR v_audit_record.document_id <> v_doc1_id THEN
        RAISE EXCEPTION 'CHECK 3 FAILED: Audit record for owner EDIT was not properly created';
    END IF;
    RAISE NOTICE 'CHECK 3 PASSED: Owner metadata update succeeded with atomic audit sequence #%', v_doc_record.audit_sequence_number;

    -- ------------------------------------------------------------------------
    -- Check 4: EDIT Grantee Updates Metadata -> SUCCESS & Audit Logged
    -- ------------------------------------------------------------------------
    SELECT * INTO v_doc_record FROM public.update_document_metadata_and_audit(
        v_edit_grantee_id,
        v_doc1_id,
        'Q3 Statement Edited by Grantee',
        'general',
        '127.0.0.1',
        'Phase7Test/1.0'
    );

    IF v_doc_record.display_name <> 'Q3 Statement Edited by Grantee' OR v_doc_record.category <> 'general' THEN
        RAISE EXCEPTION 'CHECK 4 FAILED: Metadata was not updated by EDIT grantee';
    END IF;
    RAISE NOTICE 'CHECK 4 PASSED: EDIT grantee updated metadata with atomic audit sequence #%', v_doc_record.audit_sequence_number;

    -- ------------------------------------------------------------------------
    -- Check 5: READ Grantee Denied Metadata Update -> Denied Audit Logged
    -- ------------------------------------------------------------------------
    SELECT * INTO v_doc_record FROM public.update_document_metadata_and_audit(
        v_read_grantee_id,
        v_doc1_id,
        'Tampered Title by READ Grantee',
        'legal',
        '127.0.0.1',
        'Phase7Test/1.0'
    );

    IF v_doc_record.id IS NOT NULL OR v_doc_record.category <> 'UNAUTHORIZED_ACTION' THEN
        RAISE EXCEPTION 'CHECK 5 FAILED: READ grantee was unexpectedly allowed to update metadata: %', v_doc_record;
    END IF;

    SELECT * INTO v_audit_record FROM public.audit_logs
    WHERE sequence_number = v_doc_record.audit_sequence_number;

    IF v_audit_record.id IS NULL OR (v_audit_record.metadata->>'reason') <> 'UNAUTHORIZED_ACTION' THEN
        RAISE EXCEPTION 'CHECK 5 FAILED: Denied audit log for READ grantee update attempt missing or inaccurate';
    END IF;
    RAISE NOTICE 'CHECK 5 PASSED: READ grantee denied metadata update with tamper-evident denied audit log #%', v_doc_record.audit_sequence_number;

    -- ------------------------------------------------------------------------
    -- Check 6: Unrelated User Denied Metadata Update -> Denied Audit Logged
    -- ------------------------------------------------------------------------
    SELECT * INTO v_doc_record FROM public.update_document_metadata_and_audit(
        v_unrelated_id,
        v_doc1_id,
        'IDOR Update by Unrelated User',
        'financial',
        '127.0.0.1',
        'Phase7Test/1.0'
    );

    IF v_doc_record.id IS NOT NULL OR v_doc_record.category <> 'UNAUTHORIZED_ACTION' THEN
        RAISE EXCEPTION 'CHECK 6 FAILED: Unrelated user was unexpectedly allowed to update metadata: %', v_doc_record;
    END IF;

    SELECT * INTO v_audit_record FROM public.audit_logs
    WHERE sequence_number = v_doc_record.audit_sequence_number;

    IF v_audit_record.id IS NULL THEN
        RAISE EXCEPTION 'CHECK 6 FAILED: Denied audit log for unrelated user update attempt missing';
    END IF;
    RAISE NOTICE 'CHECK 6 PASSED: Unrelated user denied metadata update with tamper-evident denied audit log #%', v_doc_record.audit_sequence_number;

    -- ------------------------------------------------------------------------
    -- Check 7: Input Validation in Procedure (Overlong Title & Bad Category)
    -- ------------------------------------------------------------------------
    SELECT * INTO v_doc_record FROM public.update_document_metadata_and_audit(
        v_owner_id,
        v_doc1_id,
        repeat('A', 300), -- 300 chars > 255 limit
        'financial',
        '127.0.0.1',
        'Phase7Test/1.0'
    );

    IF v_doc_record.id IS NOT NULL OR v_doc_record.category <> 'INVALID_INPUT' THEN
        RAISE EXCEPTION 'CHECK 7 FAILED: Overlong title was unexpectedly accepted: %', v_doc_record;
    END IF;

    SELECT * INTO v_doc_record FROM public.update_document_metadata_and_audit(
        v_owner_id,
        v_doc1_id,
        'Valid Title',
        'unsupported_category',
        '127.0.0.1',
        'Phase7Test/1.0'
    );

    IF v_doc_record.id IS NOT NULL OR v_doc_record.category <> 'INVALID_INPUT' THEN
        RAISE EXCEPTION 'CHECK 7 FAILED: Invalid category was unexpectedly accepted: %', v_doc_record;
    END IF;
    RAISE NOTICE 'CHECK 7 PASSED: Procedure independently validates display_name length and allowed categories';

    -- ------------------------------------------------------------------------
    -- Check 8: EDIT Grantee Denied Soft Deletion -> Denied Audit Logged
    -- ------------------------------------------------------------------------
    SELECT * INTO v_deleted_record FROM public.soft_delete_document_and_audit(
        v_edit_grantee_id,
        v_doc1_id,
        '127.0.0.1',
        'Phase7Test/1.0'
    );

    IF v_deleted_record.id IS NOT NULL THEN
        RAISE EXCEPTION 'CHECK 8 FAILED: EDIT grantee was unexpectedly allowed to soft-delete: %', v_deleted_record;
    END IF;

    SELECT * INTO v_audit_record FROM public.audit_logs
    WHERE sequence_number = v_deleted_record.audit_sequence_number;

    IF v_audit_record.id IS NULL OR (v_audit_record.metadata->>'reason') <> 'NOT_DOCUMENT_OWNER' THEN
        RAISE EXCEPTION 'CHECK 8 FAILED: Denied audit log for grantee deletion attempt missing or inaccurate';
    END IF;
    RAISE NOTICE 'CHECK 8 PASSED: EDIT grantee strictly denied soft-deletion (owner-only enforcement)';

    -- ------------------------------------------------------------------------
    -- Check 9: Owner Soft-Deletes Document -> SUCCESS & Audit Logged
    -- ------------------------------------------------------------------------
    SELECT * INTO v_deleted_record FROM public.soft_delete_document_and_audit(
        v_owner_id,
        v_doc1_id,
        '127.0.0.1',
        'Phase7Test/1.0'
    );

    IF v_deleted_record.id IS NULL OR v_deleted_record.deleted_at IS NULL THEN
        RAISE EXCEPTION 'CHECK 9 FAILED: Document deleted_at was not recorded';
    END IF;

    SELECT * INTO v_audit_record FROM public.audit_logs WHERE sequence_number = v_deleted_record.audit_sequence_number;
    IF v_audit_record.action <> 'DELETE' OR v_audit_record.result <> 'SUCCESS' OR (v_audit_record.metadata->>'soft_deleted') <> 'true' THEN
        RAISE EXCEPTION 'CHECK 9 FAILED: Audit record for soft deletion was not properly created';
    END IF;
    RAISE NOTICE 'CHECK 9 PASSED: Owner soft-deleted document with atomic audit sequence #%', v_deleted_record.audit_sequence_number;

    -- ------------------------------------------------------------------------
    -- Check 10: Soft-Deleted Document Immediately Disappears from list_accessible_documents
    -- ------------------------------------------------------------------------
    SELECT count(*) INTO v_count FROM public.list_accessible_documents(
        v_owner_id,
        NULL,
        NULL,
        50,
        0,
        NULL,
        NULL,
        'all'
    ) WHERE id = v_doc1_id;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'CHECK 10 FAILED: Soft-deleted document is still returned in list_accessible_documents for owner';
    END IF;

    SELECT count(*) INTO v_count FROM public.list_accessible_documents(
        v_edit_grantee_id,
        NULL,
        NULL,
        50,
        0,
        NULL,
        NULL,
        'all'
    ) WHERE id = v_doc1_id;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'CHECK 10 FAILED: Soft-deleted document is still returned in list_accessible_documents for grantee';
    END IF;
    RAISE NOTICE 'CHECK 10 PASSED: Soft-deleted document immediately vanishes from list_accessible_documents for all users';

    -- ------------------------------------------------------------------------
    -- Check 11: Subsequent Update or Delete on Soft-Deleted Document Rejected
    -- ------------------------------------------------------------------------
    SELECT * INTO v_doc_record FROM public.update_document_metadata_and_audit(
        v_owner_id,
        v_doc1_id,
        'Re-Update Attempt',
        'financial',
        '127.0.0.1',
        'Phase7Test/1.0'
    );

    IF v_doc_record.id IS NOT NULL OR v_doc_record.category <> 'DOCUMENT_NOT_FOUND' THEN
        RAISE EXCEPTION 'CHECK 11 FAILED: Update on soft-deleted document was unexpectedly allowed: %', v_doc_record;
    END IF;

    SELECT * INTO v_deleted_record FROM public.soft_delete_document_and_audit(
        v_owner_id,
        v_doc1_id,
        '127.0.0.1',
        'Phase7Test/1.0'
    );

    IF v_deleted_record.id IS NOT NULL THEN
        RAISE EXCEPTION 'CHECK 11 FAILED: Repeated deletion on soft-deleted document was unexpectedly allowed: %', v_deleted_record;
    END IF;
    RAISE NOTICE 'CHECK 11 PASSED: Soft-deleted document rejects subsequent updates and deletions with DOCUMENT_NOT_FOUND';

    -- ------------------------------------------------------------------------
    -- Check 12: Extended List Filtering (Date Range, Category, Ownership)
    -- ------------------------------------------------------------------------
    -- Query doc2 (owned by v_owner_id, category 'legal')
    -- A) Category filter match
    SELECT count(*) INTO v_count FROM public.list_accessible_documents(
        v_owner_id,
        NULL,
        'legal',
        50,
        0,
        NULL,
        NULL,
        'all'
    ) WHERE id = v_doc2_id;
    IF v_count <> 1 THEN RAISE EXCEPTION 'CHECK 12A FAILED: Category filter match failed'; END IF;

    -- B) Category filter mismatch
    SELECT count(*) INTO v_count FROM public.list_accessible_documents(
        v_owner_id,
        NULL,
        'financial',
        50,
        0,
        NULL,
        NULL,
        'all'
    ) WHERE id = v_doc2_id;
    IF v_count <> 0 THEN RAISE EXCEPTION 'CHECK 12B FAILED: Category filter mismatch leaked document'; END IF;

    -- C) Ownership filter match ('mine')
    SELECT count(*) INTO v_count FROM public.list_accessible_documents(
        v_owner_id,
        NULL,
        NULL,
        50,
        0,
        NULL,
        NULL,
        'mine'
    ) WHERE id = v_doc2_id;
    IF v_count <> 1 THEN RAISE EXCEPTION 'CHECK 12C FAILED: Ownership filter mine failed'; END IF;

    -- D) Ownership filter mismatch ('shared')
    SELECT count(*) INTO v_count FROM public.list_accessible_documents(
        v_owner_id,
        NULL,
        NULL,
        50,
        0,
        NULL,
        NULL,
        'shared'
    ) WHERE id = v_doc2_id;
    IF v_count <> 0 THEN RAISE EXCEPTION 'CHECK 12D FAILED: Ownership filter shared leaked owned document'; END IF;

    -- E) Unrelated user sees 0 rows for doc2 (no leak)
    SELECT count(*) INTO v_count FROM public.list_accessible_documents(
        v_unrelated_id,
        NULL,
        'legal',
        50,
        0,
        NULL,
        NULL,
        'all'
    ) WHERE id = v_doc2_id;
    IF v_count <> 0 THEN RAISE EXCEPTION 'CHECK 12E FAILED: Unrelated user saw private document through filter'; END IF;
    RAISE NOTICE 'CHECK 12 PASSED: Extended in-database filtering respects permissions and never leaks inaccessible records';

    -- ------------------------------------------------------------------------
    -- Check 13: Cryptographic Audit Chain Integrity Check
    -- ------------------------------------------------------------------------
    -- Verify that verify_audit_chain passes cleanly across all events generated
    PERFORM public.verify_audit_chain(1, 1000);
    RAISE NOTICE 'CHECK 13 PASSED: Tamper-evident cryptographic audit hash chain verified cleanly';

    RAISE NOTICE '=== ALL PHASE 7 DATABASE CHECKS PASSED PERFECTLY ===';

    -- Intentional rollback exception to leave connected project clean
    RAISE EXCEPTION 'TEST_CLEANUP_ROLLBACK_SUCCESS';
END $$;

