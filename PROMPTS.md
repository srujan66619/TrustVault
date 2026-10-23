# TrustVault — Prompt & Decision History (PROMPTS.md)

This document tracks all user prompts, assistant outputs, architectural critiques, developer corrections, and associated Git commit hashes throughout the lifecycle of TrustVault.

---

### Entry 1: 2026-10-21 — Initial Project Charter & Engineering Protocol Alignment

* **What was asked**:
  The user established the senior application-security engineer role for TrustVault, setting strict operational rules (small approved phases, truth in engineering, explainable code, no secret exposure) and core architectural invariants:
  - Central choke point `authorize(userId, documentId, action)` (deny-by-default, uncached live DB reads, no permission caching in JWTs, active user verification).
  - IDOR attempts return 404 while logging `ACCESS_DENIED`.
  - Supabase Storage: private bucket, server-side streaming, random UUID keys, no long-lived signed URLs, strict security headers (`Content-Disposition: attachment`, `nosniff`).
  - Strict upload validation: Zod, magic bytes, rejected executable/archive/SVG formats.
  - Append-only `audit_logs` with cryptographic hash chain (`prev_hash`, `row_hash`) and DB triggers raising on `UPDATE`/`DELETE`/`TRUNCATE`.
  - Strict test-driven verification and maintenance of `PROMPTS.md`, `THREATS.md`, `README.md`.
  - Explicit instruction: Acknowledge the rules and wait for the first phase; do not write application code yet.

* **What was produced**:
  A formal acknowledgment confirming adherence to all architectural constraints, phase start/end protocols, and truthful engineering standards without generating application code.

* **What was wrong, incomplete, or risky**:
  The local workspace directory (`c:\Users\sruja\OneDrive\Desktop\trustwallet`) was completely empty. Git was not yet initialized or connected to `https://github.com/srujan66619/TrustVault.git`. No tracking files existed.

* **What was changed or decided**:
  The user instructed to save the entire charter into a document in the project folder before proceeding.

* **Real Git Commit Hash / Link**:
  *Pending initial commit.*

---

### Entry 2: 2026-10-21 — Creation of PROJECT_RULES.md

* **What was asked**:
  "save this entire in a document in this folder"

* **What was produced**:
  Created `PROJECT_RULES.md` containing the verbatim rules, security invariants, role definitions, storage rules, audit log specifications, test coverage requirements, and Git protocol.

* **What was wrong, incomplete, or risky**:
  Saving specifications without version control meant changes were untracked. Additionally, `THREATS.md` and `PROMPTS.md` were not yet created, leaving no structured place to log threat analyses or decisions.

* **What was changed or decided**:
  The user requested the creation of `THREATS.md` (referenced as `thread.md`/`threads.md`) and `PROMPTS.md` to document prompts and manual verification procedures for potential engineering mistakes.

* **Real Git Commit Hash / Link**:
  *Pending initial commit.*

---

### Entry 3: 2026-10-21 — Initialization of PROMPTS.md & THREATS.md

* **What was asked**:
  "create thread.md and prompts.md i need you to create the documention of my prompts and in threads.md i need you to tell me yhe mannual verification where you made mistakes"

* **What was produced**:
  - `PROMPTS.md`: Truthful recording of initial prompts, scope definitions, identified risks, and decisions.
  - `THREATS.md`: STRIDE threat model, core security assertions, and a manual verification guide specifically detailing engineering mistakes (e.g., authorization bypasses, stale permissions, audit hash corruption, storage path traversal) and how to test for them manually.

* **What was wrong, incomplete, or risky**:
  Because no code or database schema is deployed yet, the manual verification steps are currently operational runbooks for testing future code rather than verified test outcomes on running code.

* **What was changed or decided**:
  Established `THREATS.md` as both the live threat matrix and the manual verification test guide for developer mistakes and hostile-reviewer inspection.

* **Real Git Commit Hash / Link**:
  *Pending initial commit.*

---

### Entry 4: 2026-10-21 — Phase 1: Application Foundation

* **What was asked**:
  "Begin Phase 1: Application Foundation only.
  Update these project rules before starting:
  - At the end of every phase, review and update `THREATS.md` and `PROMPTS.md` truthfully when the phase creates, changes, identifies, or accepts a security risk.
  - Do not create fake entries just to populate either file.
  - After every completed and approved phase, remind me to:
    1. review the changes;
    2. commit using the suggested message;
    3. push everything to `https://github.com/srujan66619/TrustVault.git`.
  - Do not claim a GitHub push succeeded unless it was actually verified.
  Phase 1 goal: establish the application foundation only.
  ...
  Strictly out of scope: authentication, authorization, roles, database schema, RLS, documents, file upload/download, storage bucket setup, permissions, audit logs, API routes, tests for unimplemented features, deployment.
  Run lint and a production build if dependencies are available. Then provide the phase report in this exact order..."

* **What was produced**:
  - Updated `PROJECT_RULES.md` with explicit phase-end checklist rules.
  - Initialized Next.js (App Router, TypeScript, Tailwind CSS).
  - Renamed package to `trustvault`.
  - Configured `.gitignore` to strictly isolate `.env*` while preserving `.env.example`.
  - Created `.env.example` with public variables and a commented-out, unused server-only `SUPABASE_SERVICE_ROLE_KEY`.
  - Created `src/lib/supabase/client.ts` strictly using public client variables.
  - Created `src/lib/supabase/server.ts` guarded by `import 'server-only'` to prevent client bundling.
  - Created baseline layout and home page with prominent banners explicitly declaring document capabilities are not implemented.
  - Created concise `README.md` detailing setup, environment rules, and out-of-scope capabilities.
  - Updated `THREATS.md` with Section 5 analyzing Phase 1-specific threats (secret leakage, false security expectations, client/server boundaries).
  - Ran `npm run lint` and `npm run build` cleanly.

* **What was wrong, incomplete, or risky**:
  - The application currently lacks live Supabase credentials; the Supabase helper functions will throw at runtime if invoked without `.env.local` configured.
  - The initial Next.js scaffolding created placeholder assets in `public/` (e.g. Next.js and Vercel SVGs) which are extraneous to a secure vault and will be cleaned or replaced as feature UI is built.
  - The `SUPABASE_SERVICE_ROLE_KEY` is documented in `.env.example` as a comment, which introduces the slight risk of developers prematurely populating and abusing it before authorization controls exist.

* **What was changed or decided**:
  - Explicitly marked `SUPABASE_SERVICE_ROLE_KEY` as unused in Phase 1.
  - Enforced server-only boundaries using the Next.js `server-only` package at compile time.
* **Real Git Commit Hash / Link**:
  [`4b28de0`](https://github.com/srujan66619/TrustVault/commit/4b28de01e0322dbc6c4ca401e6df26cfc2755df7)

---

### Entry 5: 2026-10-23 — Phase 2: Database Schema & Supabase Security Baseline (Corrections & Hardening)

* **What was asked**:
  The user reviewed the initial Phase 2 submission and withheld approval twice, requiring comprehensive hardening before committing:
  1. Add real RLS tests using authenticated user contexts (testing anonymous, unrelated user, document owner, viewer/grantee, disabled user, and admin), rather than only testing in an unrestricted superuser context.
  2. Block browser clients from directly inserting, updating, or deleting `document_permissions` via RLS, ensuring permission changes must pass through server-side authorization and mandatory audit logging.
  3. Fix `audit_logs` immutability to handle `TRUNCATE` using valid PostgreSQL statement-level trigger syntax (`FOR EACH STATEMENT`).
  4. Remove all browser-client `INSERT`, `UPDATE`, and `DELETE` RLS policies from `public.documents`. Document creation, editing, soft deletion, permission changes, and audit writes must be server-mediated in later phases so they cannot bypass `authorize()` or mandatory audit logging.
  5. Clarify and enforce the role model: only `OWNER` and `ADMIN` profiles may own documents; a `VIEWER` must not gain ownership capabilities merely by inserting a document.
  6. Update `verify_schema.sql` to prove direct client INSERT and UPDATE attempts against `documents` are denied.
  7. Record all corrections truthfully in `THREATS.md` and `PROMPTS.md`, and do not claim Phase 2 is complete until the migration is executed in the user's Supabase project.

* **What was produced**:
  - Modified [supabase/migrations/20261021000000_secure_schema_baseline.sql](file:///c:/Users/sruja/OneDrive/Desktop/trustwallet/supabase/migrations/20261021000000_secure_schema_baseline.sql):
    - Removed all client `INSERT`, `UPDATE`, and `DELETE` RLS policies from both `public.documents` and `public.document_permissions`. Browser clients have zero write access on core tables; all writes must be server-mediated.
    - Added database trigger `trg_check_document_owner_role` on `public.documents` strictly rejecting document insertion or owner updates unless `owner_id` references an ACTIVE profile with `role IN ('OWNER', 'ADMIN')`.
    - Separated `audit_logs` immutability into row-level `trg_prevent_audit_log_mutation` (for UPDATE/DELETE) and statement-level `trg_prevent_audit_log_truncate` (for TRUNCATE).
    - Added mandatory `status = 'ACTIVE'` checks across `documents`, `document_permissions`, and `audit_logs` RLS policies.
    - Resolved infinite RLS recursion (PostgreSQL error 42P17) by implementing `SECURITY DEFINER STABLE` functions (`is_document_owner`, `has_document_permission`, `is_active_user`) with fixed `search_path = public, pg_temp` to decouple cross-table RLS evaluation.
  - Rewrote [supabase/verify_schema.sql](file:///c:/Users/sruja/OneDrive/Desktop/trustwallet/supabase/verify_schema.sql) into a comprehensive test harness executing 16 discrete tests covering multi-role RLS context simulation (anon, unrelated, owner, grantee, disabled user, admin) and proving that client direct INSERT and UPDATE on `documents` are strictly denied.
  - Updated [THREATS.md](file:///c:/Users/sruja/OneDrive/Desktop/trustwallet/THREATS.md) with threats **P2-08** through **P2-13**.

* **What was wrong, incomplete, or risky**:
  - The initial migration attempted to use `BEFORE UPDATE OR DELETE OR TRUNCATE ... FOR EACH ROW` on `audit_logs`, which causes an immediate PostgreSQL engine error because TRUNCATE triggers must be `FOR EACH STATEMENT`.
  - The initial migration provided client `INSERT`/`UPDATE` RLS policies on `documents` and `document_permissions`, which would have allowed browser clients with a valid JWT to insert or modify documents and grants directly through PostgREST, completely bypassing server-side `authorize()` validation and audit trail logging.
  - The initial schema permitted any user (including `VIEWER`) to be set as `owner_id` on document insert, which violated the role boundary where only `OWNER` or `ADMIN` can create documents.
  - The initial RLS policies between `documents` and `document_permissions` contained mutual cross-table subqueries, which triggered PostgreSQL error `42P17: infinite recursion detected in policy for relation "documents"` when evaluating queries under an authenticated user.
  - The initial RLS policies did not verify user account status (`status = 'ACTIVE'`), which meant an administrative suspension of a user account would not take effect at the database level while an unexpired JWT existed.
  - The migration and verification suite have not yet been executed successfully on the user's live Supabase project.

* **What was changed or decided**:
  - Strictly enforce server-only mediation for all document and permission writes.
  - Enforce `trg_check_document_owner_role` at the database engine level.
  - Enforced active account status checks in all RLS policies.
  - Paused commit and phase approval until the user runs the SQL scripts in their Supabase project and confirms test results.


* **Real Git Commit Hash / Link**:
  *Pending verification in Supabase project and user approval.*

---

### Prompt 6: Fix Infinite RLS Policy Recursion (Error 42P17)
* **User's Request**:
  ```
  Failed to run sql query: ERROR:  42P17: infinite recursion detected in policy for relation "documents"
  CONTEXT:  SQL statement "SELECT count(*)              FROM public.documents WHERE id = v_doc_id"
  PL/pgSQL function inline_code_block line 189 at SQL statement
  ```

* **What was requested**:
  - Fix PostgreSQL engine error `42P17: infinite recursion detected in policy for relation "documents"` occurring during execution of the test suite in Supabase SQL Editor.

* **Root Cause Analysis**:
  1. **Circular Dependency Between Tables**: The policy `permissions_select_owner` on `document_permissions` checked `is_document_owner(document_id, auth.uid())`, which queried `documents`. Meanwhile, `documents_select_grantee` on `documents` checked `has_document_permission(id, auth.uid())`, which queried `document_permissions`. This created a mutual circular cross-table evaluation loop during query execution under the `authenticated` role.
  2. **`FORCE ROW LEVEL SECURITY`**: Prevented definer bypass on cross-table existence queries.

* **What was produced**:
  - Modified [supabase/migrations/20261021000000_secure_schema_baseline.sql](file:///c:/Users/sruja/OneDrive/Desktop/trustwallet/supabase/migrations/20261021000000_secure_schema_baseline.sql):
    - Denormalized `owner_id` onto `document_permissions` with automatic synchronization and validation via trigger `sync_document_permission_owner()`.
    - Rewrote `permissions_select_owner` on `document_permissions` to evaluate `owner_id = auth.uid()` directly. `document_permissions` now has **zero queries to `documents`**, converting the RLS schema into a strict Directed Acyclic Graph (DAG): `audit_logs -> documents -> document_permissions -> profiles`.
    - Removed `FORCE ROW LEVEL SECURITY` from all tables (`NO FORCE ROW LEVEL SECURITY`).
    - Converted all helper functions to procedural `LANGUAGE plpgsql`.
  - Modified [supabase/verify_schema.sql](file:///c:/Users/sruja/OneDrive/Desktop/trustwallet/supabase/verify_schema.sql):
    - Added prerequisite check verifying migration functions exist before running tests.
    - Switched test harness output to a transaction-local temporary table `CREATE TEMP TABLE test_results (...) ON COMMIT DROP` and eliminated all `public.test_results` references and `GRANT`/`DROP` statements, guaranteeing zero persistent database objects or permissions are left behind.
  - Updated [THREATS.md](file:///c:/Users/sruja/OneDrive/Desktop/trustwallet/THREATS.md) (Threat P2-13).

* **What was changed or decided**:
  - Resolved circular RLS recursion architecturally by eliminating cross-table queries in `document_permissions`.
  - Standardized on `ENABLE ROW LEVEL SECURITY;` + `NO FORCE ROW LEVEL SECURITY;` for all application tables.
  - Verification paused until the user runs both the updated migration and verification suite in Supabase.

* **Real Git Commit Hash / Link**:
  *Verified in Supabase MCP (see Entry 7).*

---

### Entry 7: 2026-10-23 — Supabase MCP Live Inspection & Verification Execution

* **What was asked**:
  The user connected the Supabase MCP server and requested:
  1. Inspect the connected Supabase project safely without altering or deleting existing data.
  2. Identify whether the Phase 2 migration has already been applied.
  3. Inspect `profiles`, `documents`, `document_permissions`, and `audit_logs` tables, RLS status, policies, functions, and triggers.
  4. Ensure `verify_schema.sql` uses a transaction-local temporary table (`ON COMMIT DROP`), has zero `public.test_results` references, no `DROP TABLE` or `GRANT` statements, and runs in one transaction ending in `ROLLBACK`.
  5. Report the live state before making any changes.

* **What was inspected & verified**:
  - **Live Connection**: Connected to Supabase project `mgqrzzbyzuyygufcpaun` running PostgreSQL 17.11 on aarch64.
  - **Migration Status**: The Phase 2 baseline schema `20261021000000_secure_schema_baseline.sql` was verified to **already be fully applied** on the remote database.
  - **Tables & RLS**: All four tables (`profiles`, `documents`, `document_permissions`, `audit_logs`) have `rls_enabled: true` and `rls_forced: false` (allowing `SECURITY DEFINER` procedures to execute cleanly without cyclic recursion).
  - **Policies**: All 7 defense-in-depth RLS policies (`profiles_select_own`, `documents_select_owner`, `documents_select_grantee`, `permissions_select_owner`, `permissions_select_grantee`, `audit_logs_select_owner`, `audit_logs_select_admin`) are active. Zero browser-client write policies exist.
  - **Functions & Triggers**: Verified all 11 security definer functions and 7 table/event triggers are in place, including `trg_prevent_profile_privilege_escalation`, `trg_check_document_owner_role`, `trg_sync_document_permission_owner`, `trg_prevent_audit_log_mutation`, `trg_prevent_audit_log_truncate`, and `on_auth_user_created` on `auth.users`.
  - **Existing Data**: Verified existing row counts across all four tables (0 rows each). Zero project data was modified or deleted.
  - **Verification Suite Execution**: Executed `supabase/verify_schema.sql` live against the database in a single transaction. All **23 out of 23 security verification tests PASSED (100% green)**. Transaction safely rolled back with zero leftover rows or temporary tables.

* **Real Git Commit Hash / Link**:
  Commit: [`9b7bfec`](https://github.com/srujan66619/TrustVault/commit/9b7bfec) — `feat(phase-2): implement defense-in-depth database schema, RLS, triggers, and verification suite`




