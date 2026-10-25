-- Migration: 20261025020000_document_metadata_and_soft_delete_procedures.sql
-- Description: Phase 7 Secure document metadata updates, owner-only soft deletion,
--              extended database list/search filtering, and least-privilege lockdown.

-- 1. LEAST-PRIVILEGE LOCKDOWN ON TABLE public.documents
-- Direct table updates, deletions, and truncations are completely revoked from
-- untrusted browser roles and service_role. All modifications must execute through
-- audited SECURITY DEFINER stored procedures.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.documents FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.documents FROM service_role;

-- 2. STORED PROCEDURE: update_document_metadata_and_audit
-- Allows document owner or active EDIT grantee to update safe metadata (display_name, category)
-- and appends an audit log event (SUCCESS or ACCESS_DENIED) within the exact same database transaction.
-- On denial, returns id = NULL with reason in category and audit_sequence_number populated.
CREATE OR REPLACE FUNCTION public.update_document_metadata_and_audit(
    p_actor_id uuid,
    p_document_id uuid,
    p_display_name text,
    p_category text,
    p_ip_address text DEFAULT NULL::text,
    p_user_agent text DEFAULT NULL::text
)
RETURNS TABLE(
    id uuid,
    owner_id uuid,
    display_name text,
    category text,
    content_type text,
    size_bytes bigint,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    audit_sequence_number bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_actor_role text;
    v_actor_status text;
    v_doc public.documents%ROWTYPE;
    v_is_owner boolean := false;
    v_grant_permission text;
    v_audit_seq bigint;
    v_trimmed_name text;
    v_trimmed_category text;
    v_old_display_name text;
    v_old_category text;
BEGIN
    -- 1. Verify actor exists and is ACTIVE
    SELECT role, status INTO v_actor_role, v_actor_status
    FROM public.profiles
    WHERE profiles.id = p_actor_id;

    IF v_actor_role IS NULL OR v_actor_status <> 'ACTIVE' THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'EDIT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'ACTOR_INACTIVE'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'ACTOR_INACTIVE'::text, NULL::text, NULL::bigint, NULL::timestamp with time zone, NULL::timestamp with time zone, v_audit_seq;
        RETURN;
    END IF;

    -- 2. Fetch target document (must exist and not be soft-deleted)
    SELECT * INTO v_doc
    FROM public.documents
    WHERE documents.id = p_document_id;

    IF v_doc.id IS NULL OR v_doc.deleted_at IS NOT NULL THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'EDIT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'DOCUMENT_NOT_FOUND'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'DOCUMENT_NOT_FOUND'::text, NULL::text, NULL::bigint, NULL::timestamp with time zone, NULL::timestamp with time zone, v_audit_seq;
        RETURN;
    END IF;

    -- 3. Verify actor authorization: owner OR active EDIT grantee
    v_is_owner := (v_doc.owner_id = p_actor_id);
    IF NOT v_is_owner THEN
        SELECT permission INTO v_grant_permission
        FROM public.document_permissions
        WHERE document_permissions.document_id = p_document_id
          AND document_permissions.grantee_id = p_actor_id;

        IF v_grant_permission IS NULL OR v_grant_permission <> 'EDIT' THEN
            SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
                p_actor_id,
                p_document_id,
                'EDIT',
                'ACCESS_DENIED',
                jsonb_build_object('reason', 'UNAUTHORIZED_ACTION'),
                p_ip_address,
                p_user_agent
            );
            RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'UNAUTHORIZED_ACTION'::text, NULL::text, NULL::bigint, NULL::timestamp with time zone, NULL::timestamp with time zone, v_audit_seq;
            RETURN;
        END IF;
    END IF;

    -- 4. Validate input metadata
    v_trimmed_name := trim(p_display_name);
    v_trimmed_category := lower(trim(p_category));

    IF v_trimmed_name IS NULL OR length(v_trimmed_name) = 0 OR length(v_trimmed_name) > 255 THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'EDIT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'INVALID_INPUT', 'detail', 'display_name length invalid'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'INVALID_INPUT'::text, NULL::text, NULL::bigint, NULL::timestamp with time zone, NULL::timestamp with time zone, v_audit_seq;
        RETURN;
    END IF;

    IF v_trimmed_name ~ '[\x00-\x1F\x7F]' OR v_trimmed_name ~ '[<>]' THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'EDIT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'INVALID_INPUT', 'detail', 'prohibited characters in display_name'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'INVALID_INPUT'::text, NULL::text, NULL::bigint, NULL::timestamp with time zone, NULL::timestamp with time zone, v_audit_seq;
        RETURN;
    END IF;

    IF v_trimmed_category NOT IN ('general', 'financial', 'legal', 'personal', 'technical') THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'EDIT',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'INVALID_INPUT', 'detail', 'unsupported category'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'INVALID_INPUT'::text, NULL::text, NULL::bigint, NULL::timestamp with time zone, NULL::timestamp with time zone, v_audit_seq;
        RETURN;
    END IF;

    v_old_display_name := v_doc.display_name;
    v_old_category := v_doc.category;

    -- 5. Execute static UPDATE on metadata
    UPDATE public.documents
    SET display_name = v_trimmed_name,
        category = v_trimmed_category,
        updated_at = now()
    WHERE documents.id = p_document_id
      AND documents.deleted_at IS NULL
    RETURNING * INTO v_doc;

    -- 6. Append audit log entry in the same transaction
    SELECT sequence_number INTO v_audit_seq
    FROM public.append_audit_log(
        p_actor_id,
        p_document_id,
        'EDIT',
        'SUCCESS',
        jsonb_build_object(
            'old_display_name', v_old_display_name,
            'new_display_name', v_trimmed_name,
            'old_category', v_old_category,
            'new_category', v_trimmed_category
        ),
        p_ip_address,
        p_user_agent
    );

    IF v_audit_seq IS NULL THEN
        RAISE EXCEPTION 'Audit logging failed during metadata update' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY
    SELECT
        v_doc.id,
        v_doc.owner_id,
        v_doc.display_name,
        v_doc.category,
        v_doc.content_type,
        v_doc.size_bytes,
        v_doc.created_at,
        v_doc.updated_at,
        v_audit_seq;
END;
$function$;

-- Revoke and grant privileges for update_document_metadata_and_audit
REVOKE ALL ON FUNCTION public.update_document_metadata_and_audit(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_document_metadata_and_audit(uuid, uuid, text, text, text, text) TO service_role;

-- 3. STORED PROCEDURE: soft_delete_document_and_audit
-- Only the document owner may soft-delete.
-- Sets deleted_at = now() and appends DELETE audit log event (SUCCESS or ACCESS_DENIED) in the exact same transaction.
-- On denial, returns id = NULL with audit_sequence_number populated.
CREATE OR REPLACE FUNCTION public.soft_delete_document_and_audit(
    p_actor_id uuid,
    p_document_id uuid,
    p_ip_address text DEFAULT NULL::text,
    p_user_agent text DEFAULT NULL::text
)
RETURNS TABLE(
    id uuid,
    deleted_at timestamp with time zone,
    audit_sequence_number bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_actor_role text;
    v_actor_status text;
    v_doc public.documents%ROWTYPE;
    v_audit_seq bigint;
    v_deleted_at timestamp with time zone;
BEGIN
    -- 1. Verify actor exists and is ACTIVE
    SELECT role, status INTO v_actor_role, v_actor_status
    FROM public.profiles
    WHERE profiles.id = p_actor_id;

    IF v_actor_role IS NULL OR v_actor_status <> 'ACTIVE' THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'DELETE',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'ACTOR_INACTIVE'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT NULL::uuid, NULL::timestamp with time zone, v_audit_seq;
        RETURN;
    END IF;

    -- 2. Fetch document record
    SELECT * INTO v_doc
    FROM public.documents
    WHERE documents.id = p_document_id;

    IF v_doc.id IS NULL OR v_doc.deleted_at IS NOT NULL THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'DELETE',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'DOCUMENT_NOT_FOUND'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT NULL::uuid, NULL::timestamp with time zone, v_audit_seq;
        RETURN;
    END IF;

    -- 3. Strictly OWNER-ONLY authorization check
    -- Grantees (even with EDIT), Admins without ownership, and unrelated users are rejected.
    IF v_doc.owner_id <> p_actor_id THEN
        SELECT sequence_number INTO v_audit_seq FROM public.append_audit_log(
            p_actor_id,
            p_document_id,
            'DELETE',
            'ACCESS_DENIED',
            jsonb_build_object('reason', 'NOT_DOCUMENT_OWNER'),
            p_ip_address,
            p_user_agent
        );
        RETURN QUERY SELECT NULL::uuid, NULL::timestamp with time zone, v_audit_seq;
        RETURN;
    END IF;

    -- 4. Execute soft deletion (record timestamp)
    UPDATE public.documents
    SET deleted_at = now(),
        updated_at = now()
    WHERE documents.id = p_document_id
      AND documents.deleted_at IS NULL
    RETURNING documents.deleted_at INTO v_deleted_at;

    IF v_deleted_at IS NULL THEN
        RAISE EXCEPTION 'Failed to soft delete document' USING ERRCODE = 'P0001';
    END IF;

    -- 5. Append audit log entry in the same transaction
    SELECT sequence_number INTO v_audit_seq
    FROM public.append_audit_log(
        p_actor_id,
        p_document_id,
        'DELETE',
        'SUCCESS',
        jsonb_build_object(
            'soft_deleted', true,
            'deleted_at', v_deleted_at,
            'display_name', v_doc.display_name,
            'category', v_doc.category
        ),
        p_ip_address,
        p_user_agent
    );

    IF v_audit_seq IS NULL THEN
        RAISE EXCEPTION 'Audit logging failed during document soft deletion' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY
    SELECT
        v_doc.id,
        v_deleted_at,
        v_audit_seq;
END;
$function$;

-- Revoke and grant privileges for soft_delete_document_and_audit
REVOKE ALL ON FUNCTION public.soft_delete_document_and_audit(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_document_and_audit(uuid, uuid, text, text) TO service_role;

-- 4. EXTENDED STORED PROCEDURE: list_accessible_documents (8-param)
-- Replaces prior version to support date-range filtering and owner filtering.
-- All filters are applied strictly AFTER permission filtering and soft-delete filtering.
CREATE OR REPLACE FUNCTION public.list_accessible_documents(
    p_user_id uuid DEFAULT NULL::uuid,
    p_search text DEFAULT NULL::text,
    p_category text DEFAULT NULL::text,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_created_after timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_created_before timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_owner_filter text DEFAULT NULL::text
)
RETURNS TABLE(
    id uuid,
    owner_id uuid,
    display_name text,
    category text,
    content_type text,
    size_bytes bigint,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    is_owner boolean,
    permission text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_caller_role text;
    v_caller_uid uuid;
    v_effective_user_id uuid;
    v_clean_owner_filter text;
BEGIN
    v_caller_role := auth.role();
    v_caller_uid := auth.uid();

    IF v_caller_role = 'service_role' OR (v_caller_role IS NULL AND current_user IN ('postgres', 'service_role')) THEN
        IF p_user_id IS NULL THEN
            RETURN;
        END IF;
        v_effective_user_id := p_user_id;
    ELSE
        IF v_caller_uid IS NULL THEN
            RETURN;
        END IF;

        IF p_user_id IS NOT NULL AND p_user_id <> v_caller_uid THEN
            RETURN;
        END IF;

        v_effective_user_id := v_caller_uid;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_effective_user_id AND p.status = 'ACTIVE'
    ) THEN
        RETURN;
    END IF;

    v_clean_owner_filter := lower(trim(COALESCE(p_owner_filter, 'all')));

    RETURN QUERY
    SELECT 
        d.id,
        d.owner_id,
        d.display_name,
        d.category,
        d.content_type,
        d.size_bytes,
        d.created_at,
        d.updated_at,
        (d.owner_id = v_effective_user_id) AS is_owner,
        CASE 
            WHEN d.owner_id = v_effective_user_id THEN 'OWNER'
            ELSE dp.permission
        END AS permission
    FROM public.documents d
    LEFT JOIN public.document_permissions dp 
        ON dp.document_id = d.id AND dp.grantee_id = v_effective_user_id
    WHERE d.deleted_at IS NULL
      AND (
          d.owner_id = v_effective_user_id 
          OR dp.permission IS NOT NULL
      )
      AND (
          p_search IS NULL 
          OR trim(p_search) = '' 
          OR d.display_name ILIKE ('%' || trim(p_search) || '%')
      )
      AND (
          p_category IS NULL 
          OR trim(p_category) = '' 
          OR d.category = lower(trim(p_category))
      )
      AND (
          p_created_after IS NULL 
          OR d.created_at >= p_created_after
      )
      AND (
          p_created_before IS NULL 
          OR d.created_at <= p_created_before
      )
      AND (
          v_clean_owner_filter = 'all'
          OR (v_clean_owner_filter = 'mine' AND d.owner_id = v_effective_user_id)
          OR (v_clean_owner_filter = 'shared' AND d.owner_id <> v_effective_user_id)
      )
    ORDER BY d.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_accessible_documents(uuid, text, text, integer, integer, timestamp with time zone, timestamp with time zone, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_documents(uuid, text, text, integer, integer, timestamp with time zone, timestamp with time zone, text) TO authenticated, service_role;

-- 5. CLEANUP: Remove legacy 5-param signature to prevent PostgREST ambiguity
DROP FUNCTION IF EXISTS public.list_accessible_documents(uuid, text, text, integer, integer);

