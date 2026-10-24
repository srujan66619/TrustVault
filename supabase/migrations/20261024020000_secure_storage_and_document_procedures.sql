-- ==============================================================================
-- TrustVault — Phase 5: Secure Storage Bucket & Document Access Procedures
-- Migration: 20261024020000_secure_storage_and_document_procedures.sql
--
-- Security Invariants Enforced:
-- 1. Private Storage Bucket: Creates private 'documents' bucket for TrustVault files.
-- 2. Client Storage Lockdown: Browser clients have no policies on storage.objects;
--    all I/O routes through the Next.js server layer with service_role.
-- 3. In-Database Search Filtering: list_accessible_documents enforces owner/grantee
--    scoping and active user checks directly in SQL before records are fetched.
-- ==============================================================================

-- 1. Create or configure private documents storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    false,
    15728640, -- 15MB limit
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'text/plain']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'text/plain']::text[];

-- 2. Procedure: List and Search Accessible Documents
-- Enforces owner and grantee scoping in the database query before records are returned.
CREATE OR REPLACE FUNCTION public.list_accessible_documents(
    p_user_id uuid,
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
BEGIN
    -- Reject invalid parameters
    IF p_user_id IS NULL THEN
        RETURN;
    END IF;

    -- Verify user profile is active
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_user_id AND p.status = 'ACTIVE'
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
        (d.owner_id = p_user_id) AS is_owner,
        dp.permission
    FROM public.documents d
    LEFT JOIN public.document_permissions dp 
        ON dp.document_id = d.id AND dp.grantee_id = p_user_id
    WHERE d.deleted_at IS NULL
      AND (
          d.owner_id = p_user_id 
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

-- Grant execution to authenticated server callers and service_role
REVOKE ALL ON FUNCTION public.list_accessible_documents(uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_documents(uuid, text, text, integer, integer) TO authenticated, service_role;
