-- ==============================================================================
-- TrustVault — Phase 5: Corrective Security Migration
-- Migration: 20261024030000_secure_documents_atomic_upload_and_idor_fix.sql
--
-- Fixes Enforced:
-- 1. Anti-IDOR list/search RPC: Does not trust caller-supplied p_user_id. Derives
--    identity from auth.uid() for client roles; rejects mismatched user contexts.
--    Returns zero rows for anonymous, disabled, and mismatched-user callers.
-- 2. Atomic document metadata creation & audit logging: Creates document row and
--    appends DOCUMENT_CREATE audit event in a single PostgreSQL transaction.
--    Server-only (service_role) execution only.
-- ==============================================================================

-- 1. Fix list_accessible_documents RPC (IDOR prevention)
CREATE OR REPLACE FUNCTION public.list_accessible_documents(
    p_user_id uuid DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    owner_id uuid,
    display_name text,
    category text,
    content_type text,
    size_bytes bigint,
    created_at timestamptz,
    updated_at timestamptz,
    is_owner boolean,
    permission text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_caller_role text;
    v_caller_uid uuid;
    v_effective_user_id uuid;
BEGIN
    v_caller_role := auth.role();
    v_caller_uid := auth.uid();

    -- Determine effective user ID based on caller privilege
    IF v_caller_role = 'service_role' OR (v_caller_role IS NULL AND current_user IN ('postgres', 'service_role')) THEN
        -- When invoked by server-side service_role or database admin, p_user_id must be explicitly provided
        IF p_user_id IS NULL THEN
            RETURN;
        END IF;
        v_effective_user_id := p_user_id;
    ELSE
        -- For browser/client callers (anon or authenticated):
        -- Anonymous callers receive zero rows
        IF v_caller_uid IS NULL THEN
            RETURN;
        END IF;

        -- If caller supplies p_user_id, it MUST strictly match their authenticated auth.uid()
        -- Any attempt to query using another user's UUID returns zero rows (IDOR defense)
        IF p_user_id IS NOT NULL AND p_user_id <> v_caller_uid THEN
            RETURN;
        END IF;

        -- Derive identity securely from verified JWT
        v_effective_user_id := v_caller_uid;
    END IF;

    -- Verify that the effective user exists and has an ACTIVE profile
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_effective_user_id AND p.status = 'ACTIVE'
    ) THEN
        RETURN;
    END IF;

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
          OR d.category = trim(p_category)
      )
    ORDER BY d.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- Grant EXECUTE to authenticated and service_role, revoke from PUBLIC and anon
REVOKE ALL ON FUNCTION public.list_accessible_documents(uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_documents(uuid, text, text, integer, integer) TO authenticated, service_role;

-- 2. Procedure: Atomic Document Creation and Audit Logging
-- Executes document insertion and append_audit_log in a single transaction.
-- If audit logging fails, document creation is completely rolled back.
CREATE OR REPLACE FUNCTION public.create_document_and_audit(
    p_owner_id uuid,
    p_display_name text,
    p_category text,
    p_content_type text,
    p_size_bytes bigint,
    p_storage_object_key uuid,
    p_ip_address text DEFAULT NULL,
    p_user_agent text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id uuid,
    owner_id uuid,
    display_name text,
    category text,
    content_type text,
    size_bytes bigint,
    storage_object_key uuid,
    created_at timestamptz,
    updated_at timestamptz,
    audit_sequence_number bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_doc public.documents%ROWTYPE;
    v_audit_seq bigint;
    v_role text;
    v_status text;
BEGIN
    -- Verify owner exists, is ACTIVE, and has role OWNER or ADMIN
    SELECT role, status INTO v_role, v_status
    FROM public.profiles
    WHERE profiles.id = p_owner_id;

    IF v_role IS NULL OR v_role NOT IN ('OWNER', 'ADMIN') OR v_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Invalid document owner: Profile must be ACTIVE and have role OWNER or ADMIN (attempted: %, role: %, status: %)',
            p_owner_id, v_role, v_status
            USING ERRCODE = '42501';
    END IF;

    -- 1. Insert document metadata
    INSERT INTO public.documents (
        owner_id,
        display_name,
        category,
        content_type,
        size_bytes,
        storage_object_key
    ) VALUES (
        p_owner_id,
        p_display_name,
        COALESCE(p_category, 'general'),
        p_content_type,
        p_size_bytes,
        p_storage_object_key
    )
    RETURNING * INTO v_doc;

    -- 2. Append audit log in the exact same transaction
    SELECT sequence_number INTO v_audit_seq
    FROM public.append_audit_log(
        p_owner_id,
        v_doc.id,
        'DOCUMENT_CREATE',
        'SUCCESS',
        jsonb_build_object(
            'mime_type', p_content_type,
            'file_size', p_size_bytes,
            'category', v_doc.category
        ) || COALESCE(p_metadata, '{}'::jsonb),
        p_ip_address,
        p_user_agent
    );

    IF v_audit_seq IS NULL THEN
        RAISE EXCEPTION 'Audit logging failed: append_audit_log returned NULL'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY
    SELECT 
        v_doc.id,
        v_doc.owner_id,
        v_doc.display_name,
        v_doc.category,
        v_doc.content_type,
        v_doc.size_bytes,
        v_doc.storage_object_key,
        v_doc.created_at,
        v_doc.updated_at,
        v_audit_seq;
END;
$$;

-- Server-only least-privilege lockdown for create_document_and_audit
REVOKE ALL ON FUNCTION public.create_document_and_audit(uuid, text, text, text, bigint, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_document_and_audit(uuid, text, text, text, bigint, uuid, text, text, jsonb) TO service_role;
