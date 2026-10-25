-- Migration: 20261025030000_documents_least_privilege_lockdown.sql
-- Description: Phase 7 Final Least-Privilege Lockdown on public.documents.
--              Revokes all direct mutation, reference, and trigger privileges from anon,
--              authenticated, and service_role. Grants strictly SELECT to authenticated and service_role.
--              Preserves document creation, metadata updates, and soft-delete only through
--              audited SECURITY DEFINER procedures.

REVOKE ALL ON TABLE public.documents FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public.documents TO authenticated, service_role;
