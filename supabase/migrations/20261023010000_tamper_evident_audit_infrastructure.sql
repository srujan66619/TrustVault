-- ==============================================================================
-- TrustVault — Phase 4: Tamper-Evident Audit-Log Infrastructure
-- Migration: 20261023010000_tamper_evident_audit_infrastructure.sql
--
-- Security Invariants Enforced:
-- 1. Strictly append-only: Row modifications (UPDATE), row purges (DELETE),
--    and table truncates (TRUNCATE) remain strictly denied by database triggers.
-- 2. Non-null cryptographic chain: Every audit row requires a monotonic sequence
--    number, prev_hash link, and SHA-256 row_hash.
-- 3. Write serialization: pg_advisory_xact_lock serializes append operations,
--    guaranteeing concurrent appends cannot fork the hash chain or introduce gaps.
-- 4. Foreign key decoupling: Removes ON DELETE SET NULL foreign keys so that
--    document or user deletions never mutate historical audit rows or erase
--    identifiers, and non-existent IDs probed during IDOR attacks can be safely logged.
-- 5. Role isolation: Direct writes and the append_audit_log procedure are strictly
--    revoked from anon and authenticated browser clients; only service_role may write.
-- ==============================================================================

-- 1. Verify pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Alter public.audit_logs table to support monotonic sequence and non-null hashes
ALTER TABLE public.audit_logs 
  ADD COLUMN IF NOT EXISTS sequence_number bigint;

-- Add unique constraint index on sequence_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_logs_sequence 
  ON public.audit_logs (sequence_number);

-- Enforce NOT NULL constraints on cryptographic chain fields
ALTER TABLE public.audit_logs 
  ALTER COLUMN prev_hash SET NOT NULL,
  ALTER COLUMN row_hash SET NOT NULL,
  ALTER COLUMN sequence_number SET NOT NULL;

-- 3. Remove ON DELETE SET NULL foreign keys to prevent deletion from mutating historical records
-- or erasing references to deleted documents/users, and to permit logging of IDOR probes.
ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey,
  DROP CONSTRAINT IF EXISTS audit_logs_document_id_fkey;

-- Expand result check constraint to support charter results (SUCCESS, ACCESS_DENIED, FAILURE)
-- as well as authorization aliases (ALLOWED, DENIED, ERROR).
ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS audit_logs_result_check;
ALTER TABLE public.audit_logs 
  ADD CONSTRAINT audit_logs_result_check 
  CHECK (result IN ('SUCCESS', 'ACCESS_DENIED', 'FAILURE', 'ALLOWED', 'DENIED', 'ERROR'));

-- 4. Function: Deterministic Canonical Payload Builder
-- Formats all audit record fields into an unambiguous, multiline prefixed string
-- for deterministic SHA-256 hashing.
CREATE OR REPLACE FUNCTION public.build_audit_canonical_payload(
    p_sequence_number bigint,
    p_id uuid,
    p_actor_id uuid,
    p_document_id uuid,
    p_action text,
    p_result text,
    p_timestamp timestamptz,
    p_prev_hash text,
    p_metadata jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT 
        'seq:' || p_sequence_number::text || E'\n' ||
        'id:' || p_id::text || E'\n' ||
        'actor:' || COALESCE(p_actor_id::text, '') || E'\n' ||
        'doc:' || COALESCE(p_document_id::text, '') || E'\n' ||
        'action:' || p_action || E'\n' ||
        'result:' || p_result || E'\n' ||
        'ts:' || to_char(p_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || E'\n' ||
        'prev:' || p_prev_hash || E'\n' ||
        'meta:' || COALESCE(p_metadata, '{}'::jsonb)::text;
$$;

-- 5. Function: Append Audit Log (Server-Side Serialized Write)
-- Acquires a transaction-scoped advisory lock (key: 8273619283746152431) to prevent
-- concurrent writes from forking the chain or creating sequence gaps.
CREATE OR REPLACE FUNCTION public.append_audit_log(
    p_actor_id uuid,
    p_document_id uuid,
    p_action text,
    p_result text,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_ip_address text DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    sequence_number bigint,
    actor_id uuid,
    document_id uuid,
    action text,
    result text,
    "timestamp" timestamptz,
    prev_hash text,
    row_hash text,
    metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_seq bigint;
    v_prev_hash text;
    v_id uuid;
    v_ts timestamptz;
    v_row_hash text;
    v_canonical text;
    v_clean_metadata jsonb;
BEGIN
    -- 5a. Validate input parameters
    IF p_action IS NULL OR trim(p_action) = '' THEN
        RAISE EXCEPTION 'Audit action cannot be null or empty';
    END IF;
    IF p_result IS NULL OR trim(p_result) = '' THEN
        RAISE EXCEPTION 'Audit result cannot be null or empty';
    END IF;

    v_clean_metadata := COALESCE(p_metadata, '{}'::jsonb);

    -- 5b. Transaction-scoped advisory lock to serialize writes and guarantee single-chain order
    PERFORM pg_advisory_xact_lock(8273619283746152431::bigint);

    -- 5c. Retrieve current head of the audit chain
    SELECT COALESCE(MAX(al.sequence_number), 0)
    INTO v_seq
    FROM public.audit_logs al;

    IF v_seq = 0 THEN
        -- Genesis record: 64 zero hex digits
        v_seq := 1;
        v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    ELSE
        SELECT al.row_hash
        INTO v_prev_hash
        FROM public.audit_logs al
        WHERE al.sequence_number = v_seq;

        IF v_prev_hash IS NULL THEN
            RAISE EXCEPTION 'Audit chain integrity failure: head sequence % has null row_hash', v_seq;
        END IF;

        v_seq := v_seq + 1;
    END IF;

    -- 5d. Generate new row attributes
    v_id := gen_random_uuid();
    v_ts := clock_timestamp();

    -- 5e. Compute canonical payload and SHA-256 hash
    v_canonical := public.build_audit_canonical_payload(
        v_seq,
        v_id,
        p_actor_id,
        p_document_id,
        p_action,
        p_result,
        v_ts,
        v_prev_hash,
        v_clean_metadata
    );

    v_row_hash := encode(digest(v_canonical, 'sha256'), 'hex');

    -- 5f. Insert into append-only audit_logs
    INSERT INTO public.audit_logs (
        id,
        sequence_number,
        actor_id,
        document_id,
        action,
        result,
        timestamp,
        ip_address,
        user_agent,
        metadata,
        prev_hash,
        row_hash
    )
    VALUES (
        v_id,
        v_seq,
        p_actor_id,
        p_document_id,
        p_action,
        p_result,
        v_ts,
        p_ip_address,
        p_user_agent,
        v_clean_metadata,
        v_prev_hash,
        v_row_hash
    );

    -- 5g. Return newly appended row
    RETURN QUERY
    SELECT 
        v_id,
        v_seq,
        p_actor_id,
        p_document_id,
        p_action,
        p_result,
        v_ts,
        v_prev_hash,
        v_row_hash,
        v_clean_metadata;
END;
$$;

-- 6. Function: Audit Chain Verification
-- Walks through audit entries, recalculating hashes and validating chain continuity.
CREATE OR REPLACE FUNCTION public.verify_audit_chain(
    p_from_sequence bigint DEFAULT 1,
    p_limit integer DEFAULT 1000
)
RETURNS TABLE (
    is_valid boolean,
    total_verified integer,
    failed_at_sequence bigint,
    failure_reason text,
    expected_value text,
    actual_value text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    r RECORD;
    v_expected_prev_hash text := '0000000000000000000000000000000000000000000000000000000000000000';
    v_expected_seq bigint := 1;
    v_recomputed_hash text;
    v_canonical text;
    v_count integer := 0;
BEGIN
    IF p_from_sequence > 1 THEN
        SELECT row_hash INTO v_expected_prev_hash
        FROM public.audit_logs
        WHERE sequence_number = p_from_sequence - 1;

        IF v_expected_prev_hash IS NULL THEN
            RETURN QUERY SELECT 
                false, 
                0, 
                p_from_sequence, 
                'Prior sequence row does not exist to establish chain anchor'::text,
                'valid prior row_hash'::text,
                'NULL'::text;
            RETURN;
        END IF;
        v_expected_seq := p_from_sequence;
    END IF;

    FOR r IN (
        SELECT 
            al.id,
            al.sequence_number,
            al.actor_id,
            al.document_id,
            al.action,
            al.result,
            al.timestamp,
            al.metadata,
            al.prev_hash,
            al.row_hash
        FROM public.audit_logs al
        WHERE al.sequence_number >= p_from_sequence
        ORDER BY al.sequence_number ASC
        LIMIT p_limit
    ) LOOP
        -- 6a. Check sequence monotonicity & no gaps
        IF r.sequence_number != v_expected_seq THEN
            RETURN QUERY SELECT 
                false, 
                v_count, 
                r.sequence_number, 
                'Sequence gap or unexpected order detected'::text,
                v_expected_seq::text, 
                r.sequence_number::text;
            RETURN;
        END IF;

        -- 6b. Check prev_hash continuity
        IF r.prev_hash != v_expected_prev_hash THEN
            RETURN QUERY SELECT 
                false, 
                v_count, 
                r.sequence_number, 
                'Broken prev_hash chain link'::text,
                v_expected_prev_hash, 
                r.prev_hash;
            RETURN;
        END IF;

        -- 6c. Recompute canonical payload and SHA-256 hash
        v_canonical := public.build_audit_canonical_payload(
            r.sequence_number,
            r.id,
            r.actor_id,
            r.document_id,
            r.action,
            r.result,
            r.timestamp,
            r.prev_hash,
            r.metadata
        );
        v_recomputed_hash := encode(digest(v_canonical, 'sha256'), 'hex');

        -- 6d. Validate integrity of row data and hash
        IF r.row_hash != v_recomputed_hash THEN
            RETURN QUERY SELECT 
                false, 
                v_count, 
                r.sequence_number, 
                'Row hash mismatch: payload data or stored hash has been modified'::text,
                v_recomputed_hash, 
                r.row_hash;
            RETURN;
        END IF;

        -- Advance expected state
        v_expected_prev_hash := r.row_hash;
        v_expected_seq := v_expected_seq + 1;
        v_count := v_count + 1;
    END LOOP;

    -- Successfully verified all evaluated records
    RETURN QUERY SELECT 
        true, 
        v_count, 
        NULL::bigint, 
        NULL::text, 
        NULL::text, 
        NULL::text;
    RETURN;
END;
$$;

-- 7. Role Privileges & Access Lockdown
-- Revoke direct write capabilities from client roles
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- Revoke execute on append mechanism from client roles; grant solely to server service_role
REVOKE ALL ON FUNCTION public.append_audit_log(uuid, uuid, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_audit_log(uuid, uuid, text, text, jsonb, text, text) TO service_role;

-- Restrict verification function execution to server service_role
REVOKE ALL ON FUNCTION public.verify_audit_chain(bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(bigint, integer) TO service_role;
