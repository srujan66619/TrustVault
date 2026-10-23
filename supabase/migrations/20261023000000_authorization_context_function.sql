-- ==============================================================================
-- TrustVault — Migration: 20261023000000_authorization_context_function.sql
-- Description: Server-side authorization context RPC for authorize() choke-point.
-- Security: SECURITY DEFINER with fixed search_path = public, pg_temp.
-- Access: Granted to authenticated, service_role, and anon.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_authorization_context(
  p_user_id uuid,
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_role text;
  v_user_status text;
  v_doc_owner_id uuid;
  v_doc_deleted boolean := false;
  v_permission text;
  v_user_found boolean := false;
  v_doc_found boolean := false;
BEGIN
  -- 1. Fetch user profile
  SELECT role, status INTO v_user_role, v_user_status
  FROM public.profiles
  WHERE id = p_user_id;
  v_user_found := FOUND;

  -- 2. Fetch document record (returns null if not found)
  SELECT owner_id, (deleted_at IS NOT NULL) INTO v_doc_owner_id, v_doc_deleted
  FROM public.documents
  WHERE id = p_document_id;
  v_doc_found := FOUND;

  -- 3. Fetch grantee permission
  SELECT permission INTO v_permission
  FROM public.document_permissions
  WHERE document_id = p_document_id AND grantee_id = p_user_id;

  RETURN json_build_object(
    'user_found', v_user_found,
    'user_role', v_user_role,
    'user_status', v_user_status,
    'doc_found', v_doc_found,
    'doc_owner_id', v_doc_owner_id,
    'doc_deleted', COALESCE(v_doc_deleted, false),
    'grant_permission', v_permission
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_authorization_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_authorization_context(uuid, uuid) TO authenticated, service_role, anon;
