-- ==============================================================================
-- TrustVault — Migration: 20261021000000_secure_schema_baseline.sql
-- Description: Core security schema, constraints, triggers, and defense-in-depth RLS.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLE: profiles
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'VIEWER' CHECK (role IN ('ADMIN', 'OWNER', 'VIEWER')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS on profiles (NO FORCE to allow SECURITY DEFINER bypass)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles NO FORCE ROW LEVEL SECURITY;

-- Index for status and role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ==============================================================================
-- 3. PROFILES: Privilege Escalation Prevention Trigger
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.role IS DISTINCT FROM NEW.role) OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    IF auth.role() IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Privilege escalation rejected: role and status cannot be modified by client requests.';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- ==============================================================================
-- 4. PROFILES: Safe New User Profile Creation Trigger
-- ==============================================================================
-- Automatically provisions a profile when auth.users is created.
-- STRICT SECURITY INVARIANT:
-- Ignores all client-provided user_metadata and forces role='VIEWER', status='ACTIVE'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, status, created_at, updated_at)
  VALUES (NEW.id, 'VIEWER', 'ACTIVE', now(), now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, supabase_auth_admin;

-- ==============================================================================
-- 5. TABLE: documents
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) > 0 AND char_length(display_name) <= 255),
  category text NOT NULL DEFAULT 'general' CHECK (char_length(category) > 0 AND char_length(category) <= 50),
  content_type text NOT NULL CHECK (char_length(content_type) > 0 AND char_length(content_type) <= 100),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 104857600), -- 100MB hard limit
  storage_object_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  deleted_at timestamptz NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents NO FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_documents_owner ON public.documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON public.documents(deleted_at);

-- INVARIANT: Only active profiles with role 'OWNER' or 'ADMIN' can own documents.
CREATE OR REPLACE FUNCTION public.check_document_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  SELECT role, status INTO v_role, v_status FROM public.profiles WHERE id = NEW.owner_id;
  IF v_role IS NULL OR v_role NOT IN ('OWNER', 'ADMIN') OR v_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Invalid document owner: Only active profiles with role OWNER or ADMIN can own documents (attempted owner_id: %, role: %, status: %).', NEW.owner_id, v_role, v_status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_document_owner_role ON public.documents;
CREATE TRIGGER trg_check_document_owner_role
BEFORE INSERT OR UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.check_document_owner_role();

-- ==============================================================================
-- 6. TABLE: document_permissions
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.document_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  grantee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('READ', 'EDIT')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT uq_document_grantee UNIQUE (document_id, grantee_id)
);

-- Ensure column exists if table was created in an earlier migration run
ALTER TABLE public.document_permissions ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Backfill owner_id for existing rows
UPDATE public.document_permissions dp
SET owner_id = d.owner_id
FROM public.documents d
WHERE dp.document_id = d.id AND dp.owner_id IS NULL;

ALTER TABLE public.document_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_permissions NO FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_permissions_document ON public.document_permissions(document_id);
CREATE INDEX IF NOT EXISTS idx_permissions_grantee ON public.document_permissions(grantee_id);
CREATE INDEX IF NOT EXISTS idx_permissions_owner ON public.document_permissions(owner_id);

-- Invariant & Sync Trigger: Automatically populate owner_id and ensure grantee is not owner
CREATE OR REPLACE FUNCTION public.sync_document_permission_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    SELECT owner_id INTO NEW.owner_id FROM public.documents WHERE id = NEW.document_id;
    IF NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'Invalid grant: Target document does not exist.';
    END IF;
  END IF;

  IF NEW.grantee_id = NEW.owner_id THEN
    RAISE EXCEPTION 'Invalid grant: Document owner (%) cannot be inserted as a grantee on their own document.', NEW.grantee_id;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_grantee_not_owner ON public.document_permissions;
DROP TRIGGER IF EXISTS trg_sync_document_permission_owner ON public.document_permissions;
CREATE TRIGGER trg_sync_document_permission_owner
BEFORE INSERT OR UPDATE ON public.document_permissions
FOR EACH ROW
EXECUTE FUNCTION public.sync_document_permission_owner();

-- ==============================================================================
-- 7. TABLE: audit_logs (Append-Only)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) > 0 AND char_length(action) <= 100),
  result text NOT NULL CHECK (result IN ('SUCCESS', 'ACCESS_DENIED', 'FAILURE')),
  timestamp timestamptz DEFAULT now() NOT NULL,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  prev_hash text,
  row_hash text
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs NO FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_document ON public.audit_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);

-- Row-level trigger blocks UPDATE and DELETE
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: UPDATE and DELETE operations are strictly prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_mutation ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_log_mutation
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- Statement-level trigger blocks TRUNCATE
CREATE OR REPLACE FUNCTION public.prevent_audit_log_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: TRUNCATE operation is strictly prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_truncate ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_log_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_audit_log_truncate();

-- ==============================================================================
-- 8. SECURITY DEFINER RLS HELPER FUNCTIONS
-- ==============================================================================
-- PURPOSE & JUSTIFICATION:
-- Required to break mutual RLS recursion between `documents` and `document_permissions`.
-- By executing queries inside STABLE SECURITY DEFINER functions in PL/pgSQL with a fixed search_path,
-- Postgres checks existence without inlining or triggering cross-table RLS recursion loops.
-- With NO FORCE ROW LEVEL SECURITY, the definer (postgres) cleanly bypasses RLS on lookup queries.
-- Only boolean existence checks are exposed; no sensitive data is returned.

-- Check if user is active
CREATE OR REPLACE FUNCTION public.is_active_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND status = 'ACTIVE'
  ) INTO v_active;
  RETURN v_active;
END;
$$;

-- Check if user is active admin
CREATE OR REPLACE FUNCTION public.is_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'ADMIN' AND status = 'ACTIVE'
  ) INTO v_is_admin;
  RETURN v_is_admin;
END;
$$;

-- Check if user is active document owner
CREATE OR REPLACE FUNCTION public.is_document_owner(p_document_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  IF p_document_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = p_document_id
      AND owner_id = p_user_id
      AND deleted_at IS NULL
  ) INTO v_is_owner;
  RETURN v_is_owner;
END;
$$;

-- Check if user has active permission on a document
CREATE OR REPLACE FUNCTION public.has_document_permission(p_document_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_has_perm boolean;
BEGIN
  IF p_document_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.document_permissions
    WHERE document_id = p_document_id
      AND grantee_id = p_user_id
  ) INTO v_has_perm;
  RETURN v_has_perm;
END;
$$;

REVOKE ALL ON FUNCTION public.is_active_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated, anon, postgres;

REVOKE ALL ON FUNCTION public.is_admin_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user(uuid) TO authenticated, anon, postgres;

REVOKE ALL ON FUNCTION public.is_document_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_document_owner(uuid, uuid) TO authenticated, anon, postgres;

REVOKE ALL ON FUNCTION public.has_document_permission(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_document_permission(uuid, uuid) TO authenticated, anon, postgres;

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES — DENY-BY-DEFAULT BASELINE
-- ==============================================================================

-- PROFILES
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() AND status = 'ACTIVE');

-- DOCUMENTS (SELECT-only for clients; INSERT/UPDATE/DELETE are strictly server-mediated)
DROP POLICY IF EXISTS "documents_select_owner" ON public.documents;
CREATE POLICY "documents_select_owner" ON public.documents
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid() 
  AND deleted_at IS NULL
  AND public.is_active_user(auth.uid())
);

DROP POLICY IF EXISTS "documents_select_grantee" ON public.documents;
CREATE POLICY "documents_select_grantee" ON public.documents
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND public.is_active_user(auth.uid())
  AND public.has_document_permission(id, auth.uid())
);

DROP POLICY IF EXISTS "documents_insert_owner" ON public.documents;
DROP POLICY IF EXISTS "documents_update_owner" ON public.documents;
DROP POLICY IF EXISTS "documents_delete_owner" ON public.documents;

-- DOCUMENT PERMISSIONS (SELECT-only for clients; INSERT/UPDATE/DELETE are strictly server-mediated)
DROP POLICY IF EXISTS "permissions_select_owner" ON public.document_permissions;
CREATE POLICY "permissions_select_owner" ON public.document_permissions
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  AND public.is_active_user(auth.uid())
);

DROP POLICY IF EXISTS "permissions_select_grantee" ON public.document_permissions;
CREATE POLICY "permissions_select_grantee" ON public.document_permissions
FOR SELECT TO authenticated
USING (
  grantee_id = auth.uid()
  AND public.is_active_user(auth.uid())
);

DROP POLICY IF EXISTS "permissions_insert_owner" ON public.document_permissions;
DROP POLICY IF EXISTS "permissions_update_owner" ON public.document_permissions;
DROP POLICY IF EXISTS "permissions_delete_owner" ON public.document_permissions;

-- AUDIT LOGS (SELECT-only for admin and document owner; INSERT/UPDATE/DELETE strictly server-mediated)
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.is_admin_user(auth.uid())
);

DROP POLICY IF EXISTS "audit_logs_select_owner" ON public.audit_logs;
CREATE POLICY "audit_logs_select_owner" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND document_id IS NOT NULL
  AND public.is_document_owner(document_id, auth.uid())
);

DROP POLICY IF EXISTS "audit_logs_insert_client" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_update_client" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_delete_client" ON public.audit_logs;
