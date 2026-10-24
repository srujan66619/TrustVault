-- ==============================================================================
-- TrustVault — Phase 4 Final Corrective Migration: Strict Least-Privilege Lockdown
-- Migration: 20261024010000_audit_least_privilege_final.sql
--
-- Security Corrections:
-- 1. `REVOKE ALL ON TABLE public.audit_logs FROM service_role`: Strips extraneous
--    REFERENCES and TRIGGER privileges from `service_role`, leaving solely SELECT.
-- 2. `REVOKE ALL ON FUNCTION public.verify_audit_chain(bigint, integer) FROM PUBLIC, anon, authenticated`:
--    Eliminates browser-side client execution of the cryptographic verification routine.
-- 3. Grants EXECUTE on `verify_audit_chain(bigint, integer)` solely to `service_role`.
-- 4. Preserves `service_role` EXECUTE on `append_audit_log(uuid, uuid, text, text, jsonb, text, text)` only.
-- ==============================================================================

-- 1. Strip all privileges on audit_logs from service_role, then grant SELECT only
REVOKE ALL ON TABLE public.audit_logs FROM service_role;
GRANT SELECT ON TABLE public.audit_logs TO service_role;

-- 2. Restrict verification routine to server service_role only
REVOKE ALL ON FUNCTION public.verify_audit_chain(bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(bigint, integer) TO service_role;

-- 3. Preserve exclusive execution on append_audit_log for service_role only
REVOKE ALL ON FUNCTION public.append_audit_log(uuid, uuid, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_audit_log(uuid, uuid, text, text, jsonb, text, text) TO service_role;
