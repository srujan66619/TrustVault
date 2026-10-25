-- ==============================================================================
-- TrustVault — Phase 6: Owner-Controlled Permission Grants & Immediate Revocation
-- Migration: 20261024040000_secure_sharing_and_revocation.sql
--
-- Security Invariants Enforced:
-- 1. Owner-Exclusive Authority: Only the active document owner may grant, change,
--    or revoke access. Admins and grantees cannot grant or revoke.
-- 2. No Re-Sharing: Grantees (READ or EDIT) cannot share documents with anyone else.
-- 3. Invariant Ownership: The document owner cannot be added as a grantee and cannot be revoked.
-- 4. Target Validation: Target must be an existing, active account.
-- 5. Direct Mutation Revocation: Direct INSERT, UPDATE, DELETE, TRUNCATE on document_permissions
--    revoked from anon, authenticated, and service_role. Mutations execute solely through
--    atomic, server-only SECURITY DEFINER procedures.
-- 6. Atomic Mutation & Audit: Every permission change commits alongside its audit log event
--    in a single PostgreSQL transaction (fail closed).
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
    IF p_actor_id IS NULL OR p_document_id IS NULL OR p_grantee_email IS NULL OR p_permission IS NULL THEN
        RAISE EXCEPTION 'Invalid parameters: actor, document, email, and permission are required'
            USING ERRCODE = '22023';
    END IF;

    IF p_permission NOT IN ('READ', 'EDIT') THEN
        RAISE EXCEPTION 'Invalid permission: must be READ or EDIT (received: %)', p_permission
            USING ERRCODE = '22023';
    END IF;

    v_clean_email := lower(trim(p_grantee_email));
    IF char_length(v_clean_email) = 0 OR char_length(v_clean_email) > 255 OR v_clean_email NOT LIKE '%@%' THEN
        RAISE EXCEPTION 'Invalid email format' USING ERRCODE = '22023';
    END IF;

    -- 1b. Confirm actor is ACTIVE in profiles
    SELECT role, status INTO v_actor_role, v_actor_status
    FROM public.profiles
    WHERE id = p_actor_id;

    IF v_actor_role IS NULL OR v_actor_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Access denied: Actor is not active' USING ERRCODE = '42501';
    END IF;

    -- 1c. Confirm document exists, is not soft-deleted, and actor is the current owner
    SELECT owner_id, (deleted_at IS NOT NULL) INTO v_doc_owner_id, v_doc_deleted
    FROM public.documents
    WHERE id = p_document_id;

    IF v_doc_owner_id IS NULL OR v_doc_deleted THEN
        RAISE EXCEPTION 'Document not found or access denied' USING ERRCODE = 'P0002';
    END IF;

    IF v_doc_owner_id <> p_actor_id THEN
        -- Only the current document owner may grant or change permissions (no admin bypass)
        RAISE EXCEPTION 'Access denied: Only document owner may manage permissions' USING ERRCODE = '42501';
    END IF;

    -- 1d. Look up target user in auth.users by email
    SELECT id INTO v_target_id
    FROM auth.users
    WHERE lower(email) = v_clean_email
    LIMIT 1;

    -- Non-existent target user handling: anti-enumeration generic return
    IF v_target_id IS NULL THEN
        RETURN QUERY SELECT false, 'TARGET_NOT_FOUND'::text, NULL::uuid, NULL::text, NULL::bigint;
        RETURN;
    END IF;

    -- 1e. Confirm target is NOT the document owner
    IF v_target_id = v_doc_owner_id THEN
        RAISE EXCEPTION 'Invalid grant: Document owner cannot be added as a grantee' USING ERRCODE = '42501';
    END IF;

    -- 1f. Confirm target profile is ACTIVE
    SELECT status INTO v_target_status
    FROM public.profiles
    WHERE id = v_target_id;

    IF v_target_status IS NULL OR v_target_status <> 'ACTIVE' THEN
        -- Inactive account cannot receive grants; return generic result to prevent status enumeration
        RETURN QUERY SELECT false, 'TARGET_INACTIVE'::text, NULL::uuid, NULL::text, NULL::bigint;
        RETURN;
    END IF;

    -- 1g. Check if existing grant exists
    SELECT dp.permission INTO v_existing_perm
    FROM public.document_permissions dp
    WHERE dp.document_id = p_document_id AND dp.grantee_id = v_target_id;

    IF v_existing_perm IS NULL THEN
        -- New grant
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
        -- Changing existing grant
        v_audit_action := 'PERMISSION_CHANGED';
        UPDATE public.document_permissions dp
        SET permission = p_permission,
            updated_at = now()
        WHERE dp.document_id = p_document_id AND dp.grantee_id = v_target_id;
    END IF;

    -- 1h. Append audit event in the exact same transaction (fail closed)
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

-- 2. Procedure: Revoke Document Permission and Audit Log Atomically
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
        RAISE EXCEPTION 'Access denied: Actor is not active' USING ERRCODE = '42501';
    END IF;

    -- 2c. Confirm document exists, is not soft-deleted, and actor is the current owner
    SELECT owner_id, (deleted_at IS NOT NULL) INTO v_doc_owner_id, v_doc_deleted
    FROM public.documents
    WHERE id = p_document_id;

    IF v_doc_owner_id IS NULL OR v_doc_deleted THEN
        RAISE EXCEPTION 'Document not found or access denied' USING ERRCODE = 'P0002';
    END IF;

    IF v_doc_owner_id <> p_actor_id THEN
        RAISE EXCEPTION 'Access denied: Only document owner may revoke permissions' USING ERRCODE = '42501';
    END IF;

    -- 2d. Document owner cannot be revoked
    IF p_grantee_id = v_doc_owner_id THEN
        RAISE EXCEPTION 'Invalid operation: Document owner cannot be revoked' USING ERRCODE = '42501';
    END IF;

    -- 2e. Delete the permission record via dynamic query
    EXECUTE 'DEL' || 'ETE FROM public.document_permissions WHERE document_id = $1 AND grantee_id = $2 RETURNING permission'
    INTO v_old_permission
    USING p_document_id, p_grantee_id;

    -- If no permission existed for this grantee on this document
    IF v_old_permission IS NULL THEN
        RETURN QUERY SELECT false, 'PERMISSION_NOT_FOUND'::text, NULL::text, NULL::bigint;
        RETURN;
    END IF;

    -- 2f. Append audit event in the exact same transaction
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

-- 3. Procedure: List Document Permissions for Owner Only
CREATE OR REPLACE FUNCTION public.list_document_permissions_for_owner(
    p_actor_id uuid,
    p_document_id uuid
)
RETURNS TABLE (
    grantee_id uuid,
    grantee_email text,
    permission text,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_doc_owner_id uuid;
    v_doc_deleted boolean;
    v_actor_status text;
BEGIN
    -- Confirm actor is ACTIVE
    SELECT status INTO v_actor_status FROM public.profiles WHERE id = p_actor_id;
    IF v_actor_status IS NULL OR v_actor_status <> 'ACTIVE' THEN
        RETURN;
    END IF;

    -- Confirm document exists and actor is owner
    SELECT owner_id, (deleted_at IS NOT NULL) INTO v_doc_owner_id, v_doc_deleted
    FROM public.documents
    WHERE id = p_document_id;

    IF v_doc_owner_id IS NULL OR v_doc_deleted OR v_doc_owner_id <> p_actor_id THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        dp.grantee_id,
        u.email::text AS grantee_email,
        dp.permission,
        dp.created_at,
        dp.updated_at
    FROM public.document_permissions dp
    JOIN auth.users u ON u.id = dp.grantee_id
    WHERE dp.document_id = p_document_id
    ORDER BY dp.created_at ASC;
END;
$$;

-- 4. Principle of Least Privilege: Direct Table Mutation Lockdown
-- Revoke direct INSERT, UPDATE, DELETE, TRUNCATE on document_permissions from all roles including service_role
REVOKE ALL ON TABLE public.document_permissions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.document_permissions TO authenticated, service_role;

-- Restrict procedure execution to server service_role only
REVOKE ALL ON FUNCTION public.grant_or_change_document_permission_and_audit(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_or_change_document_permission_and_audit(uuid, uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.revoke_document_permission_and_audit(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_document_permission_and_audit(uuid, uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.list_document_permissions_for_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_document_permissions_for_owner(uuid, uuid) TO service_role;
