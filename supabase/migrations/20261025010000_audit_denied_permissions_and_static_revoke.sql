-- ==============================================================================
-- TrustVault — Phase 6 Corrective Migration:
-- 1. Audit Every Denied Permission Attempt with Safe Reason Codes
-- 2. Replace Dynamic SQL with Static DELETE FROM ... RETURNING (Data-Modifying CTE)
-- 3. Fail-Closed Atomicity: Mutation Rolls Back if Audit Fails
-- ==============================================================================

-- 1. Procedure: Grant or Change Document Permission and Audit Log Atomically
CREATE OR REPLACE FUNCTION public.grant_or_change_document_permission_and_audit(
    p_actor_id uuid,
    p_document_id uuid,
    p_grantee_email text,
    p_permission text,
    p_ip_address text DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
    success boolean,
    status_code text,
    grantee_id uuid,
    permission text,
    audit_sequence_number bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_actor_role text;
    v_actor_status text;
    v_doc_owner_id uuid;
    v_doc_deleted boolean;
    v_target_id uuid;
    v_target_status text;
    v_existing_perm text;
    v_audit_action text;
    v_audit_seq bigint;
    v_clean_email text;
BEGIN
    -- 1a. Validate input parameters
    IF p_actor_id IS NULL OR p_document_id IS NULL THEN
        RAISE EXCEPTION 'Invalid parameters: actor and document are required' USING ERRCODE = '22023';
    END IF;

    -- Validate permission
    IF p_permission IS NULL OR p_permission NOT IN ('READ', 'EDIT') THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'GRANT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'INVALID_PERMISSION'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'INVALID_PERMISSION'::text, NULL::uuid, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- Validate email format (without logging raw email)
    IF p_grantee_email IS NULL THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'GRANT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'MALFORMED_INPUT'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'MALFORMED_INPUT'::text, NULL::uuid, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    v_clean_email := lower(trim(p_grantee_email));
    IF char_length(v_clean_email) = 0 OR char_length(v_clean_email) > 255 OR v_clean_email NOT LIKE '%@%' THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'GRANT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'MALFORMED_INPUT'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'MALFORMED_INPUT'::text, NULL::uuid, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 1b. Confirm actor is ACTIVE in profiles
    SELECT role, status INTO v_actor_role, v_actor_status
    FROM public.profiles
    WHERE id = p_actor_id;

    IF v_actor_role IS NULL OR v_actor_status <> 'ACTIVE' THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'GRANT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'ACTOR_INACTIVE'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'ACTOR_INACTIVE'::text, NULL::uuid, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 1c. Confirm document exists, is not soft-deleted
    SELECT owner_id, (deleted_at IS NOT NULL) INTO v_doc_owner_id, v_doc_deleted
    FROM public.documents
    WHERE id = p_document_id;

    IF v_doc_owner_id IS NULL OR v_doc_deleted THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'GRANT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'DOCUMENT_NOT_FOUND_OR_DELETED'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'DOCUMENT_NOT_FOUND'::text, NULL::uuid, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 1d. Confirm actor is the current owner (Denies non-owner and grantee re-sharing)
    IF v_doc_owner_id <> p_actor_id THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'GRANT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'NOT_DOCUMENT_OWNER'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'NOT_DOCUMENT_OWNER'::text, NULL::uuid, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 1e. Look up target user in auth.users by email
    SELECT id INTO v_target_id
    FROM auth.users
    WHERE lower(email) = v_clean_email
    LIMIT 1;

    -- Target not found: audit denial without logging raw email, return generic anti-enumeration
    IF v_target_id IS NULL THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'GRANT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'TARGET_NOT_FOUND'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'TARGET_NOT_FOUND'::text, NULL::uuid, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 1f. Confirm target is NOT the document owner (Self-grant blocked)
    IF v_target_id = v_doc_owner_id THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'GRANT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'CANNOT_GRANT_OWNER'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'CANNOT_GRANT_OWNER'::text, NULL::uuid, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 1g. Confirm target profile is ACTIVE
    SELECT status INTO v_target_status
    FROM public.profiles
    WHERE id = v_target_id;

    IF v_target_status IS NULL OR v_target_status <> 'ACTIVE' THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'GRANT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'TARGET_INACTIVE'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'TARGET_INACTIVE'::text, NULL::uuid, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 1h. Check if existing grant exists
    SELECT dp.permission INTO v_existing_perm
    FROM public.document_permissions dp
    WHERE dp.document_id = p_document_id AND dp.grantee_id = v_target_id;

    IF v_existing_perm IS NULL THEN
        v_audit_action := 'PERMISSION_GRANTED';
        INSERT INTO public.document_permissions (
            document_id,
            grantee_id,
            owner_id,
            permission,
            created_at,
            updated_at
        ) VALUES (
            p_document_id,
            v_target_id,
            v_doc_owner_id,
            p_permission,
            now(),
            now()
        );
    ELSE
        v_audit_action := 'PERMISSION_CHANGED';
        UPDATE public.document_permissions dp
        SET permission = p_permission,
            updated_at = now()
        WHERE dp.document_id = p_document_id AND dp.grantee_id = v_target_id;
    END IF;

    -- 1i. Append audit event in the exact same transaction (fail-closed rollback)
    SELECT sequence_number INTO v_audit_seq
    FROM public.append_audit_log(
        p_actor_id,
        p_document_id,
        v_audit_action,
        'SUCCESS',
        jsonb_build_object(
            'grantee_id', v_target_id,
            'permission', p_permission,
            'previous_permission', v_existing_perm
        ),
        p_ip_address,
        p_user_agent
    );

    IF v_audit_seq IS NULL THEN
        RAISE EXCEPTION 'Audit logging failed: append_audit_log returned NULL' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT true, 'SUCCESS'::text, v_target_id, p_permission, v_audit_seq;
END;
$$;

-- 2. Procedure: Revoke Document Permission and Audit Log Atomically (Static SQL via CTE)
CREATE OR REPLACE FUNCTION public.revoke_document_permission_and_audit(
    p_actor_id uuid,
    p_document_id uuid,
    p_grantee_id uuid,
    p_ip_address text DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
    success boolean,
    status_code text,
    revoked_permission text,
    audit_sequence_number bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_actor_role text;
    v_actor_status text;
    v_doc_owner_id uuid;
    v_doc_deleted boolean;
    v_old_permission text;
    v_audit_seq bigint;
BEGIN
    -- 2a. Validate input parameters
    IF p_actor_id IS NULL OR p_document_id IS NULL OR p_grantee_id IS NULL THEN
        RAISE EXCEPTION 'Invalid parameters: actor, document, and grantee are required'
            USING ERRCODE = '22023';
    END IF;

    -- 2b. Confirm actor is ACTIVE in profiles
    SELECT role, status INTO v_actor_role, v_actor_status
    FROM public.profiles
    WHERE id = p_actor_id;

    IF v_actor_role IS NULL OR v_actor_status <> 'ACTIVE' THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'REVOKE',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'ACTOR_INACTIVE'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'ACTOR_INACTIVE'::text, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 2c. Confirm document exists, is not soft-deleted
    SELECT owner_id, (deleted_at IS NOT NULL) INTO v_doc_owner_id, v_doc_deleted
    FROM public.documents
    WHERE id = p_document_id;

    IF v_doc_owner_id IS NULL OR v_doc_deleted THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'REVOKE',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'DOCUMENT_NOT_FOUND_OR_DELETED'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'DOCUMENT_NOT_FOUND'::text, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 2d. Confirm actor is the current owner
    IF v_doc_owner_id <> p_actor_id THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'REVOKE',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'NOT_DOCUMENT_OWNER'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'NOT_DOCUMENT_OWNER'::text, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 2e. Document owner cannot be revoked (Self-revoke blocked)
    IF p_grantee_id = v_doc_owner_id THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'REVOKE',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'CANNOT_REVOKE_OWNER'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'CANNOT_REVOKE_OWNER'::text, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 2f. Static SQL: Delete the permission record using Data-Modifying CTE
    WITH deleted_grant AS (
        DELETE FROM public.document_permissions dp
        WHERE dp.document_id = p_document_id AND dp.grantee_id = p_grantee_id
        RETURNING dp.permission
    )
    SELECT permission INTO v_old_permission FROM deleted_grant;

    -- If no permission existed for this grantee on this document
    IF v_old_permission IS NULL THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'REVOKE',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'PERMISSION_NOT_FOUND'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT false, 'PERMISSION_NOT_FOUND'::text, NULL::text, v_audit_seq;
        RETURN;
    END IF;

    -- 2g. Append audit event in the exact same transaction (fail-closed rollback)
    SELECT sequence_number INTO v_audit_seq
    FROM public.append_audit_log(
        p_actor_id,
        p_document_id,
        'PERMISSION_REVOKED',
        'SUCCESS',
        jsonb_build_object(
            'grantee_id', p_grantee_id,
            'revoked_permission', v_old_permission
        ),
        p_ip_address,
        p_user_agent
    );

    IF v_audit_seq IS NULL THEN
        RAISE EXCEPTION 'Audit logging failed: append_audit_log returned NULL' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT true, 'SUCCESS'::text, v_old_permission, v_audit_seq;
END;
$$;
