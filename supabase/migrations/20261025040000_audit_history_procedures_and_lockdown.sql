-- Migration: 20261025040000_audit_history_procedures_and_lockdown.sql
-- Description: Phase 8 Protected Activity History & Admin Audit-Chain Verification.
--              1. Revokes direct SELECT/write privileges on public.audit_logs from anon and authenticated.
--              2. Grants SELECT on public.audit_logs exclusively to service_role.
--              3. Creates server-only SECURITY DEFINER procedures for:
--                 - owner-scoped document audit history (get_document_audit_history)
--                 - owner-scoped accessible audit history (get_owner_audit_history)
--                 - admin global activity with safe projection (get_admin_global_audit_activity)
--                 - admin audit-chain verification summary (get_admin_audit_chain_summary)
--              4. Revokes execution from PUBLIC, anon, authenticated; grants exclusively to service_role.

-- 1. Complete table privilege lockdown on public.audit_logs
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public.audit_logs TO service_role;

-- 2. Procedure: Document-Specific Audit History (Owner or Admin only)
CREATE OR REPLACE FUNCTION public.get_document_audit_history(
    p_actor_id uuid,
    p_document_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_action text DEFAULT NULL,
    p_result text DEFAULT NULL,
    p_start_time timestamptz DEFAULT NULL,
    p_end_time timestamptz DEFAULT NULL
)
RETURNS TABLE(
    sequence_number bigint,
    actor_id uuid,
    document_id uuid,
    action text,
    result text,
    "timestamp" timestamptz,
    safe_metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role text;
    v_actor_status text;
    v_doc_owner_id uuid;
    v_doc_deleted timestamptz;
BEGIN
    -- 1. Validate actor profile
    SELECT role, status INTO v_actor_role, v_actor_status
    FROM public.profiles
    WHERE id = p_actor_id;

    IF NOT FOUND OR v_actor_status != 'ACTIVE' THEN
        RETURN;
    END IF;

    -- 2. Validate document
    SELECT owner_id, deleted_at INTO v_doc_owner_id, v_doc_deleted
    FROM public.documents
    WHERE id = p_document_id;

    IF NOT FOUND OR v_doc_deleted IS NOT NULL THEN
        RETURN;
    END IF;

    -- 3. Scope validation: only document owner or ADMIN may view document audit history
    -- Grantees and unrelated users receive zero rows (anti-enumeration)
    IF v_doc_owner_id != p_actor_id AND v_actor_role != 'ADMIN' THEN
        RETURN;
    END IF;

    -- 4. Return matching records with stripped/safe metadata
    -- Never project raw IP address, user agent, prev_hash, or row_hash
    RETURN QUERY
    SELECT 
        a.sequence_number,
        a.actor_id,
        a.document_id,
        a.action,
        a.result,
        a.timestamp,
        (a.metadata - 'ip_address' - 'user_agent' - 'internal_error' - 'token') AS safe_metadata
    FROM public.audit_logs a
    WHERE a.document_id = p_document_id
      AND (p_action IS NULL OR a.action = p_action)
      AND (p_result IS NULL OR a.result = p_result)
      AND (p_start_time IS NULL OR a.timestamp >= p_start_time)
      AND (p_end_time IS NULL OR a.timestamp <= p_end_time)
    ORDER BY a.sequence_number DESC
    LIMIT LEAST(COALESCE(p_limit, 50), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- 3. Procedure: Owner-Scoped Accessible Audit History
CREATE OR REPLACE FUNCTION public.get_owner_audit_history(
    p_actor_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_document_id uuid DEFAULT NULL,
    p_action text DEFAULT NULL,
    p_result text DEFAULT NULL,
    p_start_time timestamptz DEFAULT NULL,
    p_end_time timestamptz DEFAULT NULL
)
RETURNS TABLE(
    sequence_number bigint,
    actor_id uuid,
    document_id uuid,
    action text,
    result text,
    "timestamp" timestamptz,
    safe_metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role text;
    v_actor_status text;
BEGIN
    -- 1. Validate actor profile
    SELECT role, status INTO v_actor_role, v_actor_status
    FROM public.profiles
    WHERE id = p_actor_id;

    IF NOT FOUND OR v_actor_status != 'ACTIVE' THEN
        RETURN;
    END IF;

    -- 2. Query scoped strictly to documents owned by p_actor_id that are not deleted
    RETURN QUERY
    SELECT 
        a.sequence_number,
        a.actor_id,
        a.document_id,
        a.action,
        a.result,
        a.timestamp,
        (a.metadata - 'ip_address' - 'user_agent' - 'internal_error' - 'token') AS safe_metadata
    FROM public.audit_logs a
    JOIN public.documents d ON a.document_id = d.id
    WHERE d.owner_id = p_actor_id
      AND d.deleted_at IS NULL
      AND (p_document_id IS NULL OR a.document_id = p_document_id)
      AND (p_action IS NULL OR a.action = p_action)
      AND (p_result IS NULL OR a.result = p_result)
      AND (p_start_time IS NULL OR a.timestamp >= p_start_time)
      AND (p_end_time IS NULL OR a.timestamp <= p_end_time)
    ORDER BY a.sequence_number DESC
    LIMIT LEAST(COALESCE(p_limit, 50), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- 4. Procedure: Admin Global Audit Activity
CREATE OR REPLACE FUNCTION public.get_admin_global_audit_activity(
    p_actor_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_document_id uuid DEFAULT NULL,
    p_action text DEFAULT NULL,
    p_result text DEFAULT NULL,
    p_start_time timestamptz DEFAULT NULL,
    p_end_time timestamptz DEFAULT NULL
)
RETURNS TABLE(
    sequence_number bigint,
    actor_id uuid,
    document_id uuid,
    action text,
    result text,
    "timestamp" timestamptz,
    safe_metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role text;
    v_actor_status text;
BEGIN
    -- 1. Validate actor is an ACTIVE ADMIN
    SELECT role, status INTO v_actor_role, v_actor_status
    FROM public.profiles
    WHERE id = p_actor_id;

    IF NOT FOUND OR v_actor_status != 'ACTIVE' OR v_actor_role != 'ADMIN' THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required';
    END IF;

    -- 2. Global activity query with safe metadata projection
    RETURN QUERY
    SELECT 
        a.sequence_number,
        a.actor_id,
        a.document_id,
        a.action,
        a.result,
        a.timestamp,
        (a.metadata - 'ip_address' - 'user_agent' - 'internal_error' - 'token') AS safe_metadata
    FROM public.audit_logs a
    WHERE (p_document_id IS NULL OR a.document_id = p_document_id)
      AND (p_action IS NULL OR a.action = p_action)
      AND (p_result IS NULL OR a.result = p_result)
      AND (p_start_time IS NULL OR a.timestamp >= p_start_time)
      AND (p_end_time IS NULL OR a.timestamp <= p_end_time)
    ORDER BY a.sequence_number DESC
    LIMIT LEAST(COALESCE(p_limit, 50), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- 5. Procedure: Admin Audit Chain Verification Summary
CREATE OR REPLACE FUNCTION public.get_admin_audit_chain_summary(
    p_actor_id uuid
)
RETURNS TABLE(
    is_valid boolean,
    total_verified integer,
    failed_at_sequence bigint,
    failure_reason text,
    last_verified_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role text;
    v_actor_status text;
    v_report RECORD;
BEGIN
    -- 1. Validate actor is an ACTIVE ADMIN
    SELECT role, status INTO v_actor_role, v_actor_status
    FROM public.profiles
    WHERE id = p_actor_id;

    IF NOT FOUND OR v_actor_status != 'ACTIVE' OR v_actor_role != 'ADMIN' THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required';
    END IF;

    -- 2. Call internal verify_audit_chain
    SELECT 
        r.is_valid,
        r.total_verified,
        r.failed_at_sequence,
        r.failure_reason
    INTO v_report
    FROM public.verify_audit_chain(1, 100000) r;

    RETURN QUERY SELECT
        v_report.is_valid,
        v_report.total_verified,
        v_report.failed_at_sequence,
        v_report.failure_reason,
        now();
END;
$$;

-- 6. Enforce least-privilege routine execution grants
REVOKE ALL ON FUNCTION public.get_document_audit_history(uuid, uuid, integer, integer, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_audit_history(uuid, uuid, integer, integer, text, text, timestamptz, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.get_owner_audit_history(uuid, integer, integer, uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_audit_history(uuid, integer, integer, uuid, text, text, timestamptz, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.get_admin_global_audit_activity(uuid, integer, integer, uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_global_audit_activity(uuid, integer, integer, uuid, text, text, timestamptz, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.get_admin_audit_chain_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_audit_chain_summary(uuid) TO service_role;
