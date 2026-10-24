-- ==============================================================================
-- TrustVault — Phase 4 Corrective Migration: Service Role Privilege Lockdown
-- Migration: 20261023020000_audit_service_role_lockdown.sql
--
-- Security Correction:
-- Previously, `GRANT ALL ON public.audit_logs TO service_role` allowed server-side
-- code holding the service role key to directly INSERT, UPDATE, or DELETE rows in
-- `audit_logs`, which could bypass `append_audit_log`, advisory locking, and the
-- SHA-256 hash chain computation.
--
-- This migration enforces the Principle of Least Privilege:
-- 1. Direct write privileges (INSERT, UPDATE, DELETE, TRUNCATE) on public.audit_logs
--    are strictly revoked from `service_role`.
-- 2. `service_role` is granted only SELECT on public.audit_logs (for audit verification).
-- 3. Appending audit records is exclusively permitted through `public.append_audit_log`,
--    which operates as a SECURITY DEFINER function owned by postgres.
-- ==============================================================================

-- 1. Revoke all direct write privileges from service_role on public.audit_logs
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM service_role;

-- 2. Grant minimum required privilege: SELECT only
GRANT SELECT ON public.audit_logs TO service_role;

-- 3. Re-affirm EXECUTE on append_audit_log for service_role
GRANT EXECUTE ON FUNCTION public.append_audit_log(uuid, uuid, text, text, jsonb, text, text) TO service_role;

-- 4. Re-affirm EXECUTE on verify_audit_chain for service_role
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(bigint, integer) TO service_role;
