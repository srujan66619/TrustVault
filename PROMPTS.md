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

---

### Entry 8: 2026-10-23 — Phase 3: Authentication & Centralized Server-Side Authorization Core

* **What was asked**:
  Begin Phase 3 after Phase 2 verification against Supabase:
  1. Configure Supabase Auth safely for Next.js App Router (Server Components & Server Actions).
  2. Implement server-side session helpers that obtain the authenticated user via `supabase.auth.getUser()` on every protected request.
  3. Never trust client claims: read current `profiles.status` and `profiles.role` directly from the database for every decision.
  4. Create the single server-only authorization decision point: `src/lib/authorization/authorize.ts` supporting `READ`, `DOWNLOAD`, `EDIT`, `DELETE`, `GRANT`, `REVOKE`, `VIEW_AUDIT`.
  5. Enforce: deny by default, disabled users denied, owners have full access, READ grantees restricted to read/download, EDIT grantees restricted to read/download/edit, grantees denied grant/revoke/delete/view_audit, unrelated users denied, and admin role explicitly scoped (zero-trust).
  6. Return structured internal result and prevent document existence enumeration (`NOT_FOUND_OR_DENIED`).
  7. Add privileged server database client with `'server-only'` guard and secret isolation.
  8. Build a basic sign-in, sign-out, and protected account placeholder flow with Next.js PPR compatibility.
  9. Add automated test suite with mutation-resistance verification and live Supabase RPC testing.

* **What was produced**:
  - `src/lib/supabase/admin.ts`: Privileged server-only Supabase client guarded with `import 'server-only'` and `SUPABASE_SERVICE_ROLE_KEY` secret isolation.
  - `src/lib/auth/session.ts`: Server-only session helper with `getCurrentUser()` and `requireAuth()`, verifying tokens cryptographically via `auth.getUser()` and fetching live database profile metadata (`role`, `status`).
  - `src/lib/authorization/authorize.ts`: Single centralized server-side authorization choke-point implementing the full 7-action matrix, deny-by-default, zero-trust admin scoping, and anti-enumeration.
  - `supabase/migrations/20261023000000_authorization_context_function.sql`: PostgreSQL `SECURITY DEFINER` RPC `get_authorization_context` with `search_path = public, pg_temp` and PL/pgSQL `FOUND` row verification.
  - `src/app/login/page.tsx` & `src/app/login/actions.ts`: Sign-in, sign-up, and sign-out flow with React 19 / Next.js 16 Suspense boundaries.
  - `src/app/account/page.tsx`: Protected account overview placeholder verifying live session and database role/status.
  - `tests/authorization.test.ts`: Automated Vitest test suite executing 16 test cases covering all 8 actor scenarios, parameter validation, live connected Supabase RPC verification, and mutation-resistance evidence.
  - `README.md` & `THREATS.md`: Comprehensive updates including authorization matrix, threat mitigations, and zero-trust admin architecture.

* **Real Git Commit Hash / Link**:
  [`6f628fd`](https://github.com/srujan66619/TrustVault/commit/6f628fd) — `feat(phase-3): implement centralized server-side authorization core and session verification`

---

### Entry 9: 2026-10-23 — Visual-Only UI Phase: 3D Animated Security Landing Experience

* **What was asked**:
  Create a modern, dark, 3D animated security-dashboard landing experience for TrustVault:
  1. Presentation only: zero changes to Supabase schema, migrations, RLS, authentication, authorization, storage, audit code, or secrets.
  2. Dark cybersecurity aesthetic: deep navy/black, electric cyan/violet highlights, subtle glow effects.
  3. Interactive procedural 3D vault cube in the hero section using Three.js with mouse response and `prefers-reduced-motion` compliance.
  4. Pure CSS 3D fallback (`VaultFallback.tsx`) ensuring high-quality rendering without WebGL or JavaScript animations.
  5. Updated Hero: "TrustVault", headline “Document security that holds.”, statement “Access is verified at every request. Permissions can be revoked immediately.”, and placeholder action buttons.
  6. Three-card security section: Current access verification, Immediate revocation, Tamper-evident activity trail.
  7. "Built for controlled sharing" section highlighting zero-trust boundaries and anti-enumeration.
  8. Responsive navigation with explicit pending phase badges for unbuilt areas.
  9. Run lint, tests, and production build, visually inspect in browser, and provide commit instructions.

* **What was produced**:
  - `src/components/ui/VaultCanvas.tsx`: Client-only Three.js procedural 3D vault cube with glassmorphic outer frame, rotating inner cryptographic core, orbiting security anchors, and lightweight drifting particle field. Damped pointer tilt and `prefers-reduced-motion` detection.
  - `src/components/ui/VaultFallback.tsx`: Pure CSS 3D animated vault cube with glowing borders and containment status for headless/non-WebGL environments.
  - `src/components/ui/VaultScene.tsx`: Client wrapper with dynamic import (`ssr: false`) and loading fallback.
  - `src/app/page.tsx`: Polished dark cybersecurity landing page with hero, three-card security architecture, and controlled sharing section.
  - `src/app/layout.tsx`: Responsive navigation preserving Home, Account, Sign In, and clearly designated Documents and Activity placeholders.

* **Real Git Commit Hash / Link**:
  [`a56d8bd`](https://github.com/srujan66619/TrustVault/commit/a56d8bd) — `feat(ui): add 3D landing experience with truthful security copy and reduced-motion fallback`

---

### Entry 10: 2026-10-23 — Pre-Commit Security Copy Revision & Accuracy Alignment

* **What was asked**:
  Revise the 3D landing page's security copy before commit:
  1. The current UI must not present incomplete features as operational security guarantees.
  2. Replace or clearly mark as planned any claim about:
     - “Access is verified at every request”
     - “Permissions can be revoked immediately”
     - “Tamper-evident activity trail”
     - “zero token-expiry window”
     - audit immutability or hash-chain protection
     - IDOR protection and randomized storage object keys
  3. Only make a claim if it is implemented, tested, and currently used by a live route. Otherwise use wording such as “Security controls being built,” “Planned architecture,” or “Coming in a later phase.”
  4. Keep visual placeholder labels clear and accessible.
  5. Verify CSS fallback disables its rotation under `prefers-reduced-motion: reduce` (do not only disable motion in the WebGL canvas).
  6. Update `PROMPTS.md` truthfully with this correction, rerun test, lint, and build, and provide actual results without modifying Supabase, authorization, or audit code.

* **What was produced & verified**:
  - `src/app/page.tsx`:
    - Hero badge changed from `"Zero-Trust Security Core Active"` to `"TrustVault • Security Controls Being Built"`.
    - Hero copy updated to explicitly declare: `"Planned architecture: Access will be verified at every request, and permissions will be revocable immediately. The foundation is engineered with PostgreSQL Row-Level Security and a centralized server-side authorization core; live document routes and private storage access are coming in a later phase."`
    - Three-card section renamed to `"Security Controls Being Built"` under `"Target Security Specifications"`.
    - Card 1: Replaced operational guarantee with `"Access verification architecture"` labeled `"Planned Architecture • Coming in a Later Phase"`, detailing that the server-side `authorize()` core is unit-tested, while live document streaming endpoints are planned.
    - Card 2: Replaced operational claim with `"Immediate revocation design"` labeled `"Target Security Model • In Development"`, noting that `authorize()` tests reject `DISABLED` accounts, while live endpoint revocation is scheduled for Phase 4.
    - Card 3: Replaced claim with `"Audit trail & integrity model"` labeled `"Security Controls Being Built"`, clarifying that PostgreSQL append-only triggers prevent row mutation and truncates in the database, while cryptographic rolling hash chains and automatic route-level logging are coming in a later phase.
    - Controlled sharing section updated to `"Built for controlled sharing (Planned)"` under `"Planned Architecture • Specifications"`, clarifying that granular capabilities (`READ`, `DOWNLOAD`, `EDIT`), zero-trust admin boundaries, IDOR defenses, and randomized UUID storage keys are target architecture specifications to be delivered in Phases 4 and 5.
    - Roadmap disclosure box updated to explicitly contrast live operational capabilities (`/login`, `/account`, profiles RLS, `authorize()` unit tests) with in-development features.
  - `src/app/layout.tsx`:
    - Updated metadata description and footer status line to reflect Phase 3 authorization core and planned architecture status.
  - `src/components/ui/VaultFallback.tsx`:
    - Verified multi-layer reduced motion enforcement: React `window.matchMedia('(prefers-reduced-motion: reduce)')` state listener, Tailwind CSS `motion-reduce:animate-none`, and an inline `<style jsx>` block with `@media (prefers-reduced-motion: reduce) { .vault-cube-spin { animation: none !important; transform: rotateX(15deg) rotateY(25deg) !important; } }`.
  - Zero changes made to Supabase schema, migrations, RLS, authentication, authorization, or audit code.

* **Real Git Commit Hash / Link**:
  [`a56d8bd`](https://github.com/srujan66619/TrustVault/commit/a56d8bd) — `feat(ui): add 3D landing experience with truthful security copy and reduced-motion fallback`

---

### Entry 11: 2026-10-23 — Phase 4: Tamper-Evident Audit-Log Infrastructure

* **What was asked**:
  Begin Phase 4 after confirming previous commits were pushed:
  1. Keep scope limited to audit infrastructure, migrations, verification, and documentation. Do not build document CRUD, upload/download routes, sharing UI, grant/revoke endpoints, or admin activity screens.
  2. Inspect connected Supabase project schema, policies, triggers, functions, and rows.
  3. Create timestamped migration `supabase/migrations/20261023010000_tamper_evident_audit_infrastructure.sql`.
  4. Implement safe audit design:
     - Non-null `prev_hash`, `row_hash`, and monotonic `sequence_number`.
     - Transaction-scoped advisory lock (`pg_advisory_xact_lock`) to serialize writes and prevent hash chain forking.
     - Deterministic canonical payload builder and SHA-256 computation.
     - Privilege isolation: table writes and `append_audit_log` revoked from browser client roles (`anon`, `authenticated`), granted strictly to server `service_role`.
     - Preserve append-only triggers blocking UPDATE, DELETE, and TRUNCATE.
     - Drop `ON DELETE SET NULL` foreign keys to preserve audit identifiers upon document/user deletion and support IDOR non-existent document probe logging.
  5. Add server-only audit helper `src/lib/audit/audit.ts` that fails closed (`AuditLoggingError`).
  6. Add verification function `verify_audit_chain` detecting tampered data, modified hashes, broken links, and sequence gaps.
  7. Add real tests against connected Supabase project via MCP and Vitest.
  8. Update `README.md`, `THREATS.md`, and `PROMPTS.md`.

* **What was produced & verified**:
  - `supabase/migrations/20261023010000_tamper_evident_audit_infrastructure.sql`:
    - Created monotonic `sequence_number bigint NOT NULL UNIQUE`, non-null `prev_hash`, and non-null `row_hash`.
    - Dropped `ON DELETE SET NULL` foreign keys on `actor_id` and `document_id`.
    - Added `build_audit_canonical_payload` for deterministic multiline prefixed string formatting.
    - Added `append_audit_log` with `pg_advisory_xact_lock(8273619283746152431::bigint)` concurrency serialization and genesis anchor handling (64 zeros).
    - Added `verify_audit_chain` recomputing SHA-256 hashes and validating continuity.
    - Applied privilege lockdown: revoked write and append execute privileges from `anon` and `authenticated`; granted exclusively to `service_role`.
  - Applied migration live to Supabase project via Supabase MCP `apply_migration`.
  - `src/lib/audit/audit.ts`:
    - Server-only audit module with `logAuditEvent` and `verifyAuditChain`.
    - Fail-closed error handling with `AuditLoggingError`.
  - `supabase/verify_audit_chain.sql` & `verify_audit_security_baseline`:
    - 14 live verification tests executed against Supabase via MCP, verifying hash chain continuity, tampered payload detection, forged hash detection, broken link detection, sequence gap detection, client privilege revocation, trigger protection, and fail-closed validation. All 14 tests PASSED (100% green).
  - `tests/audit.test.ts`:
    - Automated Vitest test suite executing 9 tests verifying live Supabase permission denial, live `verify_audit_security_baseline` execution, fail-closed parameter validation, and verification reporting.
  - Test & Build Results:
    - `npm test`: 25 passed across 2 test files (100% green).
    - `npm run lint`: 0 errors, 0 warnings.
    - `npm run build`: Production build compiled cleanly with all routes optimized.
  - Updated `README.md` and `THREATS.md` (Threats P4-01 through P4-06).

* **Real Git Commit Hash / Link**:
  [e4a6c75](https://github.com/srujan66619/TrustVault/commit/e4a6c75)

---

### Entry 12: 2026-10-23 — Phase 4 Correction: Service Role Privilege Lockdown on audit_logs

* **What was asked**:
  Fix the role privilege over-grant before committing Phase 4:
  1. `GRANT ALL ON public.audit_logs TO service_role` previously allowed server-side service-role clients to directly insert audit rows, bypassing `append_audit_log`, transaction advisory locking, and SHA-256 hash calculation.
  2. Create a new timestamped migration (`20261023020000_audit_service_role_lockdown.sql`) without editing previous migrations.
  3. Revoke direct `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` privileges on `public.audit_logs` from `service_role`.
  4. Grant `service_role` only minimum required privilege (`SELECT` for verification).
  5. Keep `EXECUTE` on `append_audit_log` for `service_role` and confirm `SECURITY DEFINER` function writes successfully.
  6. Add live Supabase test proving:
     - `service_role` direct INSERT is denied;
     - `service_role` can append only through `append_audit_log`;
     - the appended row validates through `verify_audit_chain`.
  7. Update `THREATS.md` and `PROMPTS.md` truthfully.

* **What was produced & verified**:
  - `supabase/migrations/20261023020000_audit_service_role_lockdown.sql`:
    - Revoked `INSERT, UPDATE, DELETE, TRUNCATE` on `public.audit_logs` from `service_role`.
    - Granted `SELECT` on `public.audit_logs` to `service_role`.
    - Re-affirmed `EXECUTE` on `append_audit_log` and `verify_audit_chain` for `service_role`.
  - Applied migration live to Supabase via Supabase MCP `apply_migration`.
  - Updated `public.verify_audit_security_baseline()` and `supabase/verify_audit_chain.sql` with 16 comprehensive tests:
    - Test 9: `has_table_privilege('service_role', 'public.audit_logs', 'INSERT') = false` (PASSED).
    - Test 10: `service_role` appends exclusively through `append_audit_log` via `SECURITY DEFINER` (PASSED).
    - Test 11: Appended record validates through `verify_audit_chain` (PASSED).
  - Executed test suite live against Supabase via MCP: all **16 out of 16 tests PASSED (100% green)**.
  - Updated `tests/audit.test.ts` to assert live execution and passing of all 16 security tests.
  - Test & Build Results:
    - `npm test`: 25 passed across 2 test files (100% green).
    - `npm run lint`: 0 errors, 0 warnings.
    - `npm run build`: Production build succeeded.
  - Updated `THREATS.md` with Threat **P4-07**.

* **Real Git Commit Hash / Link**:
  [e4a6c75](https://github.com/srujan66619/TrustVault/commit/e4a6c75)

---

### Entry 13: 2026-10-24 — Phase 4 Reconciliation: Live Database Signature Audit & Rollback Isolation

* **What was asked**:
  1. Inspect live database via Supabase MCP to resolve conflicting object names and function signatures in the previous report.
  2. Return exact query outputs for:
     - `\df+ public.append_audit_log` equivalent query from `pg_proc`;
     - `\df+ public.verify_audit_chain` equivalent query from `pg_proc`;
     - `information_schema.columns` for `public.audit_logs`;
     - `pg_trigger` entries for `public.audit_logs`;
     - privilege checks for `service_role` on `audit_logs` and both functions.
  3. Reconcile repository migrations, code, and documentation to match the live database exactly with exact parameter signatures:
     - `public.append_audit_log(p_actor_id uuid, p_document_id uuid, p_action text, p_result text, p_metadata jsonb, p_ip_address text, p_user_agent text)`
     - `public.verify_audit_chain(p_from_sequence bigint, p_limit integer)`
  4. Identify whether live verification tests inserted permanent audit rows, label them clearly as test events, and explain why test data was written (calling `append_audit_log` inside `verify_audit_security_baseline()` committed rows on each test run).
  5. Refactor test harnesses so that all dynamic write, append, and validation tests execute within a single transaction terminated with `ROLLBACK;`.
  6. Rerun direct `service_role` denial test, controlled append test, chain verification, Vitest, lint, and build. Show actual outputs and stop for review.

* **What was produced & verified**:
  - Live inspection confirmed:
    - Function signature for `append_audit_log`: `(uuid, uuid, text, text, jsonb, text, text)` returning `TABLE(id uuid, sequence_number bigint, actor_id uuid, document_id uuid, action text, result text, "timestamp" timestamptz, prev_hash text, row_hash text, metadata jsonb)`.
    - Function signature for `verify_audit_chain`: `(bigint, integer)` returning `TABLE(is_valid boolean, total_verified integer, failed_at_sequence bigint, failure_reason text, expected_value text, actual_value text)`.
    - `public.audit_logs` sequence column is `sequence_number` (type `bigint`).
    - Active triggers are `trg_prevent_audit_log_mutation` (`BEFORE UPDATE OR DELETE`) and `trg_prevent_audit_log_truncate` (`BEFORE TRUNCATE`).
    - Privileges for `service_role` on `public.audit_logs`: `SELECT`, `REFERENCES`, `TRIGGER` (direct write privileges strictly revoked).
    - Routine privileges for `service_role`: `EXECUTE` on both `append_audit_log` and `verify_audit_chain`.
  - Permanent audit row audit: 10 rows exist in `public.audit_logs` (seq 1..3 from initial migration smoke-tests, seq 4..10 from prior test runs). All 10 rows form an unbroken cryptographic SHA-256 chain verified by `verify_audit_chain(1, 1000)`.
  - Refactored `public.verify_audit_security_baseline()` into an idempotent, zero-write inspection function.
  - Refactored `supabase/verify_audit_chain.sql` into a transaction-scoped runner with `BEGIN; ... CREATE TEMP TABLE ... ROLLBACK;`, executing 19 comprehensive tests (including dynamic direct INSERT denial under `service_role` rejecting with SQLSTATE 42501, controlled append via SECURITY DEFINER, and chain validation) leaving 0 permanent rows.
  - Reran test suites:
    - Vitest: 25 passed across 2 test files (100% green).
    - ESLint: 0 errors, 0 warnings.
    - Next.js Build: Compiled and prerendered successfully with PPR.

* **Real Git Commit Hash / Link**:
  [e4a6c75](https://github.com/srujan66619/TrustVault/commit/e4a6c75)

---

### Entry 14: 2026-10-24 — Phase 4 Final Least-Privilege Correction: Complete Privilege Lockdown

* **What was asked**:
  1. Create a new timestamped migration (`20261024010000_audit_least_privilege_final.sql`) without editing previous migrations.
  2. Execute:
     ```sql
     REVOKE ALL ON TABLE public.audit_logs FROM service_role;
     GRANT SELECT ON TABLE public.audit_logs TO service_role;

     REVOKE ALL ON FUNCTION public.verify_audit_chain(bigint, integer)
     FROM PUBLIC, anon, authenticated;
     GRANT EXECUTE ON FUNCTION public.verify_audit_chain(bigint, integer)
     TO service_role;
     ```
  3. Preserve `service_role` EXECUTE on `append_audit_log(uuid, uuid, text, text, jsonb, text, text)` only.
  4. Run live checks proving:
     - `service_role` has only `SELECT` on `audit_logs` (no `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`);
     - `anon` and `authenticated` cannot execute either audit function;
     - `service_role` can append through `append_audit_log`;
     - `service_role` can verify through `verify_audit_chain`;
     - the chain remains valid;
     - all verification writes are rolled back.
  5. Update `THREATS.md` and `PROMPTS.md` truthfully, rerun tests, lint, and build. Stop for approval before committing.

* **What was produced & verified**:
  - `supabase/migrations/20261024010000_audit_least_privilege_final.sql` created and applied live via Supabase MCP `apply_migration` (`{"success": true}`).
  - Live PostgreSQL inspection confirmed:
    - `service_role` table privileges on `public.audit_logs`: strictly `SELECT` (`can_select: true`, all others `false`).
    - `anon` and `authenticated` function privileges: `can_execute_append: false`, `can_execute_verify: false`.
    - `service_role` routine privileges: `EXECUTE` on `append_audit_log` and `verify_audit_chain`.
  - Live 5-point verification suite executed within transaction rollback:
    - Check 1: `service_role Strict SELECT-Only on audit_logs` (PASSED)
    - Check 2: `Client Roles Denied Both Functions` (PASSED)
    - Check 3: `service_role Can Append Through append_audit_log` (PASSED, transient sequence 11)
    - Check 4: `service_role Can Verify Through verify_audit_chain` (PASSED, total_verified=11)
    - Check 5: `Audit Log Cryptographic Chain Remains Valid` (PASSED)
    - Transaction `ROLLBACK;` executed; table row count confirmed unchanged at 10.
  - Added test in `tests/audit.test.ts` verifying `anon` client cannot execute `verify_audit_chain`.
  - Updated `THREATS.md` with Threat **P4-08**.
  - Test & Build Results:
    - Vitest: 26 passed across 2 test files (100% green).
    - ESLint: 0 errors, 0 warnings.
    - Next.js Build: Compiled successfully with Partial Prerendering.

* **Real Git Commit Hash / Link**:
  [700c284](https://github.com/srujan66619/TrustVault/commit/700c284)

---

### Entry 15: 2026-10-24 — Phase 5: Secure Document Upload, List, Metadata, and Download Routes

* **What was asked**:
  1. Implement secure document access and file handling: document upload, list/search, metadata, and download routes.
  2. Scope boundaries: Keep work strictly limited to secure document access and file handling. Do not build sharing/grant/revoke UI, permission-management routes, audit-history UI, admin dashboard, or search UI beyond safe server endpoints.
  3. Create one private Supabase Storage bucket for TrustVault documents with zero direct browser client upload, download, list, update, or delete access.
  4. Never issue signed download URLs.
  5. All uploads and downloads must pass through Next.js server routes.
  6. Generate random UUID storage object keys server-side; never derive physical paths from filenames or user IDs.
  7. Do not expose the service-role key to client components.
  8. Enforce centralized authorization (`authorize(userId, documentId, action)`) on every single-document route; return uniform 404 (`NOT_FOUND_OR_DENIED`) for invalid, unauthorized, soft-deleted, and nonexistent document IDs.
  9. In-database filtering for list and search before fetching records; run `authorize()` on each returned document as defense in depth.
  10. Multi-layer upload validation: Zod for metadata, explicit file type allow-list (PDF, PNG, JPEG, plain text), magic-byte verification, extension check, 15MB size limit, filename sanitization. Reject SVG, HTML, executables, archives, null bytes, and traversal.
  11. Mandatory audit logging with fail-closed semantics. Atomicity on upload failure (safe deletion of uploaded storage object if database/audit fails). Re-authorize immediately before download streaming, and ensure download audit succeeds before sending bytes.
  12. Add real tests against connected Supabase environment; update README, THREATS.md, and PROMPTS.md. Stop and wait for approval before Phase 6.

* **What was produced & verified**:
  - Applied migration `20261024020000_secure_storage_and_document_procedures.sql`:
    - Private bucket `documents` created (`public: false`, `file_size_limit: 15728640`, allowed MIME types PDF, PNG, JPEG, text).
    - Storage RLS verified; browser roles `anon` and `authenticated` have zero storage policies.
    - RPC `public.list_accessible_documents(p_user_id, p_search, p_category, p_limit, p_offset)` created with in-database owner/grantee filtering.
  - Installed `zod` via `npm install zod --legacy-peer-deps`.
  - Implemented `src/lib/documents/validation.ts`: Zod schema, magic-byte detector (`%PDF-`, PNG, JPEG, UTF-8 text without control/null bytes), extension validator, and filename sanitizer.
  - Implemented `src/lib/documents/documents.ts`: server-side functions `uploadDocument`, `listAccessibleDocuments`, `getDocumentMetadata`, and `downloadDocument` with fail-closed auditing and atomic rollback.
  - Implemented route handlers:
    - `POST /api/documents` (upload with atomic storage cleanup and audit logging)
    - `GET /api/documents` (list/search with in-database filtering and defense-in-depth authorization)
    - `GET /api/documents/[id]` (metadata retrieval with uniform 404 response)
    - `GET /api/documents/[id]/download` (streamed binary download with pre-stream re-authorization and attachment headers)
  - Added 23 real integration tests in `tests/documents.test.ts`.
  - Updated `README.md` and `THREATS.md` (Section 9, threats P5-01 through P5-09).
  - Test & Build Results:
    - `npm test`: **49 passed across 3 test files (100% green)**.
    - `npm run lint`: **0 errors, 0 warnings**.
    - `npm run build`: Compiled and prerendered successfully with Next.js PPR and Turbopack.

* **Real Git Commit Hash / Link**:
  [841f4d6](https://github.com/srujan66619/TrustVault/commit/841f4d6)

---

### Entry 16: 2026-10-24 — Phase 5 Corrective Migration: Anti-IDOR List RPC, Atomic Upload Procedure & Exact Authorization Actions

* **What was asked**:
  1. Fix the `SECURITY DEFINER` list/search RPC IDOR:
     - Do not trust a caller-supplied `p_user_id`.
     - Derive caller identity inside the function from `auth.uid()`.
     - Reject with 0 rows if an authenticated client supplies `p_user_id <> auth.uid()`.
     - Ensure the function returns zero rows for anonymous, disabled, and mismatched-user callers.
     - Add live tests proving an authenticated unrelated user cannot call the RPC with the owner’s UUID to obtain titles, metadata, categories, or document IDs.
  2. Make upload metadata creation and the successful audit event atomic:
     - Do not use separate service-role database calls for document `INSERT` and audit append.
     - Add a server-only, least-privilege database procedure (`create_document_and_audit`) that creates document metadata and appends the `DOCUMENT_CREATE` audit event in one transaction.
     - If that procedure fails, delete the just-uploaded Storage object as compensation.
     - Add a test proving an audit failure leaves neither a document metadata row nor a Storage object.
  3. Ensure exact authorization actions:
     - Download routes must call `authorize(userId, documentId, 'DOWNLOAD')`, not a generic `'VIEW'`.
     - Metadata routes must use the intended read action (`'READ'`).
     - Add tests demonstrating the exact `DOWNLOAD` authorization branch is exercised.
  4. Confirm list/search audit logging exists for allowed and denied requests, without recording sensitive search terms or document contents.
  5. Apply corrective migration through Supabase MCP, execute live isolation tests, run test/lint/build, update `THREATS.md` and `PROMPTS.md`, and stop for approval before committing.

* **What was produced & verified**:
  - Created and applied corrective migration `20261024030000_secure_documents_atomic_upload_and_idor_fix.sql`:
    - Updated `public.list_accessible_documents(p_user_id, p_search, p_category, p_limit, p_offset)`: derives identity from `auth.uid()` for client callers; rejects mismatched `p_user_id <> auth.uid()` with 0 rows; returns 0 rows for anonymous, disabled, or mismatched contexts.
    - Created `public.create_document_and_audit(...)`: atomic procedure creating document row and calling `append_audit_log` within a single PostgreSQL transaction; granted strictly to `service_role`.
  - Created `supabase/verify_phase5_security.sql`: transaction-scoped runner executing 8 security tests terminating with `ROLLBACK;`. All 8 passed (100% green).
  - Updated `src/lib/documents/documents.ts`:
    - `uploadDocument`: calls `create_document_and_audit` RPC; deletes uploaded Storage key upon failure (compensating transaction).
    - `listAccessibleDocuments`: audits allowed and denied requests; metadata records `has_search` boolean and counts, strictly excluding raw search terms and contents.
    - `downloadDocument`: calls `authorize(userId, documentId, 'DOWNLOAD')` and rechecks before streaming.
    - `getDocumentMetadata`: calls `authorize(userId, documentId, 'READ')`.
  - Updated `src/lib/auth/session.ts`: added `userId` to `AuthenticationError` so denied sessions are logged in the audit trail.
  - Updated `src/app/api/documents/route.ts`: logs `ACCESS_DENIED` audit events for rejected upload and list requests.
  - Updated `tests/documents.test.ts`: 29 automated tests (all 55 tests pass project-wide).
  - Updated `THREATS.md` (Threats `P5-01`, `P5-08`, `P5-09`, `P5-10`).
  - Test & Build Results:
    - Vitest: **55 passed across 3 test files (100% green)**.
    - ESLint: **0 errors, 0 warnings**.
    - Next.js Build: Compiled successfully with Partial Prerendering and Turbopack.

* **Real Git Commit Hash / Link**:
  [841f4d6](https://github.com/srujan66619/TrustVault/commit/841f4d6)


### Entry 17: 2026-10-25 — Phase 6: Owner-Controlled Permission Grants & Immediate Revocation

* **What was asked**:
  Implement Phase 6: Owner-controlled permission grants and immediate revocation:
  1. Core Requirements:
     - Only current document owner may grant, change, or revoke access (no silent admin grant/revoke bypass).
     - Grantees cannot re-share documents with anyone else (non-transitive).
     - An owner cannot be added as a grantee and cannot be revoked.
     - Only active target accounts can receive a grant.
     - Permissions strictly restricted to `READ` and `EDIT`.
     - Non-enumerable target user input: accept exact email address, validate server-side via Zod, and handle nonexistent targets with a generic response preventing user enumeration.
     - Direct table write privileges (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`) on `document_permissions` revoked from all roles including `service_role`.
  2. Database Design & Procedures:
     - `public.grant_or_change_document_permission_and_audit(...)`: validates actor is active owner, document not soft-deleted, target active non-owner, valid permission (`READ` or `EDIT`), upserts grant, and appends audit event (`PERMISSION_GRANTED` or `PERMISSION_CHANGED`) in a single transaction.
     - `public.revoke_document_permission_and_audit(...)`: validates actor is active owner, non-owner target, deletes grant, and appends `PERMISSION_REVOKED` audit event in a single transaction.
     - `public.list_document_permissions_for_owner(...)`: lists grants with grantee emails strictly for the document owner.
     - Stored procedures restricted exclusively to `service_role`.
  3. Routes & UI:
     - `GET /api/documents/[id]/permissions`: owner-only grant list endpoint.
     - `POST /api/documents/[id]/permissions`: owner-only grant/change endpoint enforcing Zod validation and generic anti-enumeration response.
     - `DELETE /api/documents/[id]/permissions/[granteeId]`: owner-only immediate revocation endpoint.
     - Protected owner permission-management client component (`OwnerSharingManager.tsx`) on `/account` page without user directory or client-side auth logic.
  4. Immediate Revocation:
     - Zero signed download URLs: downloads stream server-side with immediate pre-stream `authorize(..., 'DOWNLOAD')` recheck.
     - Sub-millisecond denial on the very next metadata, search/list, and download request after revocation commits.
  5. Verification & Tests:
     - Live transactional verification script (`supabase/verify_phase6_security.sql`).
     - Connected Supabase test suite (`tests/permissions.test.ts`) covering all 23 owner, grantee, admin, self-grant, re-sharing, table lockdown, and immediate revocation scenarios.
     - Full test suite, ESLint, and Next.js build verification.
     - Documentation updates in `README.md` and `THREATS.md`.

* **What was produced & verified**:
  - `supabase/migrations/20261024040000_secure_sharing_and_revocation.sql`:
    - Implemented atomic procedures `grant_or_change_document_permission_and_audit`, `revoke_document_permission_and_audit`, and `list_document_permissions_for_owner`.
    - Revoked direct table writes on `document_permissions` from `anon`, `authenticated`, and `service_role`.
    - Granted routine execution exclusively to `service_role`.
  - `supabase/verify_phase6_security.sql`: Tested 13 procedural security assertions live on Supabase with clean transactional rollback.
  - `src/lib/documents/permissions.ts`: Domain service with Zod schema (`grantPermissionSchema`), anti-enumeration generic responses, and deferred admin client initialization.
  - `src/app/api/documents/[id]/permissions/route.ts`: Server route handler for `GET` (list grants) and `POST` (grant/update permissions).
  - `src/app/api/documents/[id]/permissions/[granteeId]/route.ts`: Server route handler for `DELETE` (immediate revocation).
  - `src/app/account/OwnerSharingManager.tsx` & `src/app/account/page.tsx`: Protected UI component with exact email input, grant form, active grants list, and immediate revocation action.
  - `tests/permissions.test.ts`: 23 automated tests verifying live Supabase least-privilege lockdown, Zod validation, centralized authorization matrix, immediate revocation, domain anti-enumeration, and mutation resistance.
  - Documentation: Updated `README.md` and added Section 10 to `THREATS.md` (Threats `P6-01` through `P6-08`).
  - Verification Results:
    - Vitest: **78 tests passed across 4 test suites (100% green)**.
    - ESLint: **0 errors, 0 warnings**.
    - Next.js Production Build: Compiled cleanly with partial prerendering and Turbopack.

* **Real Git Commit Hash / Link**:
  [8fc534d](https://github.com/srujan66619/TrustVault/commit/8fc534d)

---

## 8. Prompt: Phase 6 Corrective Migration & Test Update (Denied Auditing, Static CTE Revocation & Revocation Semantics)

* **Prompt received from user**:
  ```text
  Phase 6 needs a corrective migration and test update before approval.

  1. Audit every denied permission attempt:
  - Ensure failed grant/change/revoke attempts create a tamper-evident denied audit event before returning or raising.
  - Cover: non-owner actor, grantee re-sharing, self-grant, self-revoke, inactive target, nonexistent target, invalid permission, soft-deleted/nonexistent document, and malformed input where an authenticated actor/document ID is available.
  - Do not log raw target email addresses. Record only safe reason codes, document UUID if supplied, actor UUID if known, and no sensitive content.
  - Add real tests proving both allowed and denied grant/revoke attempts are present in the audit chain.
  - If audit logging fails for an allowed mutation, the mutation must still roll back.

  2. Correct revocation documentation:
  - Remove the claim that revocation blocks “subsequent chunks” of an already-started download.
  - State accurately: authorization is rechecked immediately before streaming; revocation blocks the next request, but bytes already released to an active stream cannot be recalled.
  - Keep the pre-stream download authorization recheck.

  3. Replace unnecessary dynamic SQL:
  - Create a new timestamped migration that uses `CREATE OR REPLACE FUNCTION` for `revoke_document_permission_and_audit`.
  - Replace `EXECUTE 'DEL' || 'ETE ...'` with clear, static `DELETE FROM ... RETURNING`.
  - Preserve parameter binding, atomic audit behavior, and all existing permission checks.

  4. Strengthen immediate-revocation tests:
  - Prove the former grantee is denied on the next metadata route, list/search route, and download route after revocation commits.
  - Show that removal of the central `authorize(..., 'REVOKE')` route check or owner-check branch causes a meaningful test failure.

  Update THREATS.md and PROMPTS.md truthfully, run live MCP verification, tests, lint, and build, then report actual results. Stop for approval before commit.
  ```

* **What was planned & executed**:
  1. Live Database Migration:
     - Authored and deployed `supabase/migrations/20261025010000_audit_denied_permissions_and_static_revoke.sql` live via Supabase MCP tool `execute_sql`.
     - Updated `public.grant_or_change_document_permission_and_audit` to capture all denied conditions (`INVALID_PERMISSION`, `MALFORMED_INPUT`, `ACTOR_INACTIVE`, `DOCUMENT_NOT_FOUND`, `NOT_DOCUMENT_OWNER`, `TARGET_NOT_FOUND`, `CANNOT_GRANT_OWNER`, `TARGET_INACTIVE`) into `public.append_audit_log` with action `'GRANT'` and result `'ACCESS_DENIED'`.
     - Replaced dynamic SQL in `public.revoke_document_permission_and_audit` with static PostgreSQL Data-Modifying CTE (`WITH deleted_grant AS (DELETE FROM public.document_permissions dp WHERE dp.document_id = p_document_id AND dp.grantee_id = p_grantee_id RETURNING dp.permission) SELECT permission INTO v_old_permission FROM deleted_grant;`) preserving pure parameter bindings and atomic audit append.
     - Added denied audit logging for revoke failure branches (`ACTOR_INACTIVE`, `DOCUMENT_NOT_FOUND`, `NOT_DOCUMENT_OWNER`, `CANNOT_REVOKE_OWNER`, `PERMISSION_NOT_FOUND`).
     - Strictly excluded raw recipient email addresses from audit metadata; only machine reason codes and target UUIDs are logged.
  2. Live MCP Verification:
     - Executed 15 security and integrity checks via `supabase/verify_phase6_security.sql` using Supabase MCP `execute_sql`.
     - Verified all 15 checks passed cleanly in an autonomous rollback transaction:
       - Check 1: Owner granted READ to active user (Allowed -> `PERMISSION_GRANTED`).
       - Check 2: Permission row stored in `document_permissions`.
       - Check 3: Owner changed permission from READ to EDIT (Allowed -> `PERMISSION_CHANGED`).
       - Check 4: Inactive target account rejected with denied audit event (`TARGET_INACTIVE`).
       - Check 5: Owner self-grant blocked with denied audit event (`CANNOT_GRANT_OWNER`).
       - Check 6: Non-owner grant blocked with denied audit event (`NOT_DOCUMENT_OWNER`).
       - Check 7: Grantee re-sharing blocked with denied audit event (`NOT_DOCUMENT_OWNER`).
       - Check 8: Invalid permission blocked with denied audit event (`INVALID_PERMISSION`).
       - Check 9: Nonexistent document grant blocked with denied audit event (`DOCUMENT_NOT_FOUND`).
       - Check 10: Nonexistent grant revocation recorded denied audit event (`PERMISSION_NOT_FOUND`).
       - Check 11: Revoking owner blocked with denied audit event (`CANNOT_REVOKE_OWNER`).
       - Check 12: Owner revoked grant immediately via static CTE deletion (`PERMISSION_REVOKED`).
       - Check 13: Permission row deleted from `document_permissions`.
       - Check 14: Monotonic audit chain recorded all allowed and denied operations.
       - Check 15: Zero raw email addresses leaked into audit metadata.
  3. Domain Service Enhancements:
     - Updated `src/lib/documents/permissions.ts` to log `MALFORMED_INPUT` audit events on input validation failures when actor and document UUIDs are present.
     - Added UUID format validation for `granteeId` in `revokeDocumentPermission` with `MALFORMED_INPUT` audit logging.
     - Propagated audit sequence numbers in `GrantResult` and `RevokeResult`.
  4. Documentation Truthfulness:
     - Updated `THREATS.md` (P6-04, P6-09, P6-10) and `README.md` to remove claims that revocation blocks "subsequent chunks" of an active download stream.
     - Accurately stated: authorization is rechecked immediately before streaming; revocation blocks the next request across metadata, list/search, and download routes, but bytes already released to an active network stream cannot be recalled once written to the network socket.
  5. Test Suite Expansion (`tests/permissions.test.ts`):
     - Added tests proving immediate revocation blocks the former grantee across all 3 routes (metadata, list/search, download).
     - Added test demonstrating that removing central `authorize(..., 'REVOKE')` route check causes a meaningful test failure.
     - Added test demonstrating that removing owner-check branch causes a meaningful test failure.
     - Added tests verifying `ACCESS_DENIED` audit events are logged for malformed input, non-owner actor, self-grant, self-revoke, and invalid permissions.
     - Added test verifying zero raw emails in audit metadata.
     - Added test verifying atomic rollback if audit logging fails for an allowed mutation.

* **What was produced & verified**:
  - `supabase/migrations/20261025010000_audit_denied_permissions_and_static_revoke.sql`: Corrective migration with static CTE deletion and comprehensive denied audit logging.
  - `supabase/verify_phase6_security.sql`: Live 15-assertion procedural verification script with transactional rollback.
  - `src/lib/documents/permissions.ts`: Updated domain service with malformed input audit logging and sequence number propagation.
  - `tests/permissions.test.ts`: Expanded to 31 tests (all green).
  - `THREATS.md`: Updated Threat P6-04 and added Threats P6-09 and P6-10.
  - `README.md`: Corrected stream revocation documentation and detailed static CTE / denied audit logging.
  - Automated Verification:
    - Vitest: **86 passed across 4 test suites (100% green)**.
    - Next.js Production Build: **Compiled cleanly with 0 TypeScript errors and optimized static/dynamic routes**.
    - Live Supabase: **15/15 procedural assertions passed**.

* **Real Git Commit Hash / Link**:
  [8fc534d](https://github.com/srujan66619/TrustVault/commit/8fc534d)

---

## 9. Prompt: Real Mutation-Resistance Proof Walkthrough & Route-Level Database Procedure Spies

* **Prompt received from user**:
  ```text
  Phase 6 needs real mutation-resistance proof before commit.

  The existing simulated-mutant tests are insufficient. Add tests that exercise the actual production route handlers and actual `authorize()` module, not a separately written fake mutant.

  Required proof:

  1. Add a route-level test for permission grant and revoke that spies on the database procedure call.
     - For a non-owner/grantee request, assert the route returns generic 404 and the grant/revoke procedure is never called.
     - This test must fail if the real `authorize(..., 'GRANT')` or `authorize(..., 'REVOKE')` call is removed from the production route.

  2. Add direct tests against the actual exported `authorize()` module.
     - Unrelated user must be denied.
     - READ and EDIT grantees must be denied GRANT and REVOKE.
     - Owner must be allowed.
     - These tests must fail if the real owner-check or grantee-action branch is removed.

  3. Perform an actual temporary mutation walkthrough:
     - Make one minimal temporary removal/change to the real production authorization check.
     - Run the relevant normal test command and capture the failing result.
     - Restore the exact original source before final checks.
     - Do not commit the mutation.
     - Document the actual failing command/result truthfully in `PROMPTS.md` and README/testing notes.

  4. Rerun the untouched full suite, lint, and build after restoration.

  Return the exact mutated file/check, failing test output, restored-file confirmation, and final clean test result. Stop for approval before commit.
  ```

* **What was planned & executed**:
  1. Route-Level Production Authorization Tests ([`tests/permissions.test.ts`](file:///c:/Users/sruja/OneDrive/Desktop/trustwallet/tests/permissions.test.ts)):
     - Imported the actual Next.js route handlers `POST` (`/api/documents/[id]/permissions`) and `DELETE` (`/api/documents/[id]/permissions/[granteeId]`).
     - Spied on `createAdminClient().rpc` to track privileged database procedure calls (`grant_or_change_document_permission_and_audit` and `revoke_document_permission_and_audit`).
     - Added test: Non-owner calls `POST /api/documents/[id]/permissions` -> returns generic 404 and database grant procedure is NEVER called (`expect(grantOrRevokeRpcSpy).not.toHaveBeenCalled()`).
     - Added test: Grantee calls `POST /api/documents/[id]/permissions` (re-sharing attempt) -> returns generic 404 and database grant procedure is NEVER called.
     - Added test: Non-owner calls `DELETE /api/documents/[id]/permissions/[granteeId]` -> returns generic 404 and database revoke procedure is NEVER called.
     - Added test: Grantee calls `DELETE /api/documents/[id]/permissions/[granteeId]` -> returns generic 404 and database revoke procedure is NEVER called.
  2. Direct Production `authorize()` Tests:
     - Verified owner allows all 7 document actions (`isOwner: true`, `reason: 'AUTHORIZED'`).
     - Verified READ grantee denied `GRANT` and `REVOKE` with `reason: 'UNAUTHORIZED_ACTION'`.
     - Verified EDIT grantee denied `GRANT` and `REVOKE` with `reason: 'UNAUTHORIZED_ACTION'`.
     - Verified unrelated user denied `GRANT` and `REVOKE` with `reason: 'NOT_FOUND_OR_DENIED'`.
  3. Real Mutation Walkthrough:
     - Mutated file: [`src/lib/documents/permissions.ts`](file:///c:/Users/sruja/OneDrive/Desktop/trustwallet/src/lib/documents/permissions.ts) lines 82-100.
     - Mutation applied: Commented out the real central authorization check (`const authz = await authorize(actorId, documentId, 'GRANT'); if (!authz.allowed) return ...;`).
     - Failing command executed: `npx vitest run tests/permissions.test.ts`.
     - Failing test output captured:
       - `proves POST /api/documents/[id]/permissions returns generic 404 and NEVER calls grant database procedure for non-owner`: FAILED with `AssertionError: expected 200 to be 404` and procedure was called.
       - `proves POST /api/documents/[id]/permissions returns generic 404 and NEVER calls grant database procedure for grantee (anti-re-sharing)`: FAILED with `AssertionError: expected 200 to be 404`.
       - `rejects grant request from non-owner with NOT_FOUND_OR_DENIED without leaking doc existence`: FAILED with `AssertionError: expected 'PROCEDURE_ERROR' to be 'NOT_FOUND_OR_DENIED'`.
       - `audits non-owner grant attempts with ACCESS_DENIED and safe reason code`: FAILED with `AssertionError: expected 'PROCEDURE_ERROR' to be 'NOT_FOUND_OR_DENIED'`.
       - Total: 4 failed, 29 passed.
  4. Restoration & Final Verification:
     - Restored exact original source in `src/lib/documents/permissions.ts`.
     - Confirmed clean working tree on `src/lib/documents/permissions.ts` via `git diff` (0 diff lines).
     - Reran full test suite: **88 / 88 tests passed across all 4 test files**.
     - Reran production build: **Compiled successfully with partial prerendering and Turbopack (exit code 0)**.

* **Real Git Commit Hash / Link**:
  [8fc534d](https://github.com/srujan66619/TrustVault/commit/8fc534d)

---

## 10. Prompt: Phase 7 — Secure Document Dashboard, Metadata Management & Soft Deletion

* **Prompt received from user**:
  ```text
  Begin Phase 7: Secure document dashboard, metadata management, and soft deletion.

  Prerequisite: Phase 6, including its `PROMPTS.md` commit-link update, is committed and pushed.

  Goal: turn the secure document routes into a usable protected document-management workflow. Add document dashboard UI, safe metadata editing, search filters, and owner-only soft deletion. Do not add public links, document content replacement, permanent deletion, bulk export, or the admin activity dashboard yet.

  First inspect the existing document routes, `authorize()` actions, current migrations, Storage bucket, audit helpers, and deployed Supabase schema through MCP. Do not edit an already-applied migration; add new timestamped migrations only.

  Security model:
  - Dashboard data must come only from protected server routes or server-side rendering using the current authenticated session.
  - Never make an authorization decision in a client component.
  - Use the central `authorize(userId, documentId, action)` module:
    - READ for viewing metadata;
    - DOWNLOAD for downloading;
    - EDIT for metadata edits;
    - DELETE for soft deletion.
  - In this phase, EDIT means editing only safe metadata: display name and category. It does not imply content replacement, which remains explicitly unbuilt.
  - Only the document owner may soft-delete.
  - A soft-deleted document must immediately disappear from list/search, metadata, permissions, and download results.
  - Return the same generic external response for unknown, forbidden, and soft-deleted document IDs.
  - All allowed and denied metadata-update/delete attempts must be audit-logged through the existing tamper-evident audit mechanism.
  - Allowed mutation must fail closed if audit recording fails.

  Database and route requirements:
  - Create server-only, least-privilege atomic procedures for:
    - metadata update plus audit event;
    - soft deletion plus audit event.
  - Procedures must independently validate active actor, current authorization-relevant owner/grant state, valid input, and non-deleted document status.
  - Revoke direct document-table UPDATE/DELETE privileges from service_role if controlled procedures can perform these operations.
  - Keep Storage objects private. Soft deletion must not directly erase a Storage object or audit history in this phase; document the retained-object cleanup risk.
  - Add protected routes for metadata update and soft deletion.
  - Extend safe list/search filtering with category, created-date range, and owner filtering, but apply every filter inside the database query after permission filtering. Never leak inaccessible document titles, owner details, or categories.
  - Validate every body/query parameter with Zod and enforce strict length, date, pagination, and search limits.

  UI requirements:
  - Replace the Documents navigation placeholder with a protected responsive document dashboard.
  - Include: upload form, accessible document list, safe search/filter controls, download action, metadata edit control only when EDIT is allowed, delete control only when DELETE is allowed, owner-only permission-management link/panel, clear empty, loading, error, and "not authorized" states.
  - Keep the existing 3D visual style, but prioritize readability and accessibility.
  - Do not render untrusted filenames or metadata as HTML.
  - Clearly label content replacement, permanent deletion, admin activity, and bulk management as not built.

  Tests:
  - Add real tests for all required security constraints.
  - Run live Supabase verification through MCP, then run test, lint, and production build.
  - Update README/API docs, THREATS.md, and PROMPTS.md.
  - End with exact files changed, actual migrations/tests, unresolved risks, three hostile-reviewer concerns, suggested commit message, and Git commands.
  - Stop and wait for approval before Phase 8.
  ```

* **What was planned & executed**:
  1. **Live Supabase Schema Migration (`20261025020000_document_metadata_and_soft_delete_procedures.sql`)**:
     - Revoked direct `UPDATE`, `DELETE`, and `TRUNCATE` privileges on `public.documents` from `anon`, `authenticated`, and `service_role`.
     - Created `public.update_document_metadata_and_audit(...)`: validates actor status, non-deleted status, owner or active EDIT grantee, safe display name, and category. Appends tamper-evident audit log atomically. Granted exclusively to `service_role`.
     - Created `public.soft_delete_document_and_audit(...)`: enforces owner-only authority, records `deleted_at = now()`, and appends `DELETE` audit log event atomically. Granted exclusively to `service_role`.
     - Deployed canonical 8-param `list_accessible_documents`: enforces permission scoping before evaluating search query, category, createdAfter, createdBefore, and owner filter (`all`, `mine`, `shared`).
  2. **Strict Validation & Domain Services**:
     - `src/lib/documents/validation.ts`: Added `updateDocumentMetadataSchema.strict()` and `listDocumentsQuerySchema` with strict date parsing, search limits, and mass-assignment prevention.
     - `src/lib/documents/documents.ts`: Implemented `updateDocumentMetadata` and `softDeleteDocument` with centralized `authorize()` gating, fail-closed audit handling, and anti-enumeration generic errors.
  3. **Route Handlers**:
     - `src/app/api/documents/[id]/route.ts`: Added `PATCH` (metadata edit) and `DELETE` (soft-delete), returning uniform 404 for nonexistent, forbidden, or soft-deleted records.
     - `src/app/api/documents/route.ts`: Extended `GET` with strict query validation for extended search filters.
  4. **Document Dashboard UI (`/documents`)**:
     - `src/app/layout.tsx`: Activated Documents navigation link.
     - `src/app/documents/page.tsx`: Protected server route with `requireAuth()`.
     - `src/app/documents/DocumentDashboard.tsx`: Cyber-vault styled responsive dashboard with upload form, filter bar, document cards with permission badges, safe text rendering, role-gated edit/delete modals, sharing manager links, and clear disclosures for explicitly unbuilt features.
  5. **Live & Automated Verification**:
     - Live database security suite (`supabase/verify_phase7_security.sql`) passed all 13 checks live in Supabase via MCP.
     - Automated test suite (`tests/documents.test.ts`) expanded with 24 Phase 7 tests. Total test count across workspace reached 112 tests (100% passing).
     - ESLint passed cleanly with 0 errors and 0 warnings.
     - Next.js production build compiled cleanly.
  6. **Documentation**:
     - Updated `README.md` with Phase 7 baseline, API docs, and unbuilt features.
     - Updated `THREATS.md` with Section 11 threat analysis matrix.

* **Real Git Commit Hash / Link**:
  *Pending user review, approval, and commit.*

---

## 11. Prompt: Phase 7 Verification — Final Least-Privilege & Real Mutation Proof

* **Prompt received from user**:
  ```text
  Phase 7 needs final least-privilege and real mutation-proof verification before commit.

  1. Inspect live table privileges for `anon`, `authenticated`, and `service_role` on `public.documents` for SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER.

  - No role may directly INSERT, UPDATE, DELETE, or TRUNCATE document rows.
  - If any direct mutation privilege remains, create a new timestamped corrective migration:
    - revoke all document-table privileges from the affected role;
    - grant only the minimum required read privilege;
    - preserve document creation, metadata update, and soft-delete only through their `SECURITY DEFINER` procedures.
  - Add live tests proving direct document INSERT, UPDATE, DELETE, and TRUNCATE are denied for browser roles and `service_role`.

  2. Perform real temporary mutation walkthroughs on the production source:

  - Temporarily remove or bypass the actual `authorize(userId, documentId, 'EDIT')` check in the production metadata-update path. Run the relevant normal test command and capture its failure.
  - Restore the exact production source.
  - Temporarily remove or bypass the actual `authorize(userId, documentId, 'DELETE')` check in the production soft-delete path. Run the relevant normal test command and capture its failure.
  - Restore the exact production source.
  - Rerun the full untouched suite, lint, and production build.
  - Do not commit either temporary mutation.

  Update `THREATS.md` and `PROMPTS.md` truthfully with the privilege audit and actual mutation failures. Return the live privilege output, failing test outputs, restoration confirmation, and final clean results. Stop for approval before commit.
  ```

* **What was planned & executed**:
  1. **Live Table Privilege Audit & Corrective Migration (`20261025030000_documents_least_privilege_lockdown.sql`)**:
     - Queried `information_schema.table_privileges` on `public.documents` via Supabase MCP:
       - Found residual privileges: `service_role` had direct `INSERT`, `REFERENCES`, `TRIGGER`; `anon` and `authenticated` had `REFERENCES`, `TRIGGER`.
     - Created and deployed migration `supabase/migrations/20261025030000_documents_least_privilege_lockdown.sql`:
       ```sql
       REVOKE ALL ON TABLE public.documents FROM anon, authenticated, service_role;
       GRANT SELECT ON TABLE public.documents TO authenticated, service_role;
       ```
     - Re-inspected live table privileges via Supabase MCP:
       - `authenticated`: strictly `SELECT`
       - `service_role`: strictly `SELECT`
       - `anon`: 0 table privileges
       - Direct `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` are 100% revoked across all roles.
     - Document creation, metadata edits, and soft-delete operate exclusively through audited `SECURITY DEFINER` procedures (`create_document_and_audit`, `update_document_metadata_and_audit`, `soft_delete_document_and_audit`).
     - Added live automated tests in `tests/documents.test.ts` and `supabase/verify_phase7_security.sql` proving direct `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` fail for browser roles (`anon`) and `service_role`.

  2. **Real Temporary Mutation Walkthrough 1 — Bypass `authorize(..., 'EDIT')`**:
     - Production source mutated: [`src/lib/documents/documents.ts`](file:///c:/Users/sruja/OneDrive/Desktop/trustwallet/src/lib/documents/documents.ts) lines 498-515.
     - Mutation applied: Bypassed the central authorization check in `updateDocumentMetadata`:
       ```typescript
       // const auth = await authorize(userId, documentId, 'EDIT');
       // if (!auth.allowed) { ... return { success: false, error: 'Document not found or access denied', notFoundOrDenied: true }; }
       const auth = { allowed: true, isOwner: false, grantPermission: 'READ' as const, reason: undefined };
       ```
     - Ran test command: `npx vitest run tests/documents.test.ts`.
     - Failing test output captured (3 tests failed):
       - `denies READ grantee metadata update and audits denial`: `AssertionError: expected undefined to be true` (did not return `notFoundOrDenied`).
       - `owner successfully updates metadata and soft-deletes with atomic audit recording`: `AssertionError: expected false to be true` (mocked permission mismatch).
       - `proves PATCH /api/documents/[id] returns generic 404 and NEVER calls update database procedure for READ grantee`: `AssertionError: expected 400 to be 404` (bypassed route returned validation error instead of generic 404).
     - Restored exact original production source in `src/lib/documents/documents.ts`.

  3. **Real Temporary Mutation Walkthrough 2 — Bypass `authorize(..., 'DELETE')`**:
     - Production source mutated: [`src/lib/documents/documents.ts`](file:///c:/Users/sruja/OneDrive/Desktop/trustwallet/src/lib/documents/documents.ts) lines 599-616.
     - Mutation applied: Bypassed the central authorization check in `softDeleteDocument`:
       ```typescript
       // const auth = await authorize(userId, documentId, 'DELETE');
       // if (!auth.allowed) { ... return { success: false, error: 'Document not found or access denied', notFoundOrDenied: true }; }
       const auth = { allowed: true, isOwner: true, grantPermission: null, reason: undefined };
       ```
     - Ran test command: `npx vitest run tests/documents.test.ts`.
     - Failing test output captured (4 tests failed):
       - `denies EDIT grantee soft-deletion and audits denial`: `AssertionError: expected undefined to be true` (did not return `notFoundOrDenied`).
       - `denies unrelated user soft-deletion and audits denial`: `AssertionError: expected undefined to be true` (did not return `notFoundOrDenied`).
       - `proves DELETE /api/documents/[id] returns generic 404 and NEVER calls delete database procedure for EDIT grantee`: `AssertionError: expected 400 to be 404` (bypassed route reached procedure call).
       - `proves DELETE /api/documents/[id] returns generic 404 and NEVER calls delete database procedure for unrelated user`: `AssertionError: expected 400 to be 404` (bypassed route reached procedure call).
     - Restored exact original production source in `src/lib/documents/documents.ts`.

  4. **Restoration & Full Suite Clean Verification**:
     - Confirmed clean working tree on `src/lib/documents/documents.ts` via `git diff`: 0 mutation lines remaining.
     - Full test suite: **113 / 113 tests passed across all 4 test files** (`tests/authorization.test.ts`, `tests/audit.test.ts`, `tests/permissions.test.ts`, `tests/documents.test.ts`).
     - ESLint: **0 errors, 0 warnings** (exit code 0).
     - Next.js production build: **Compiled successfully in Turbopack, TypeScript checked, 10 routes generated** (exit code 0).
     - Updated `THREATS.md` with **P7-09** documenting complete least-privilege lockdown on `public.documents`.

* **Real Git Commit Hash / Link**:
  *Pending user review, approval, and commit.*


















