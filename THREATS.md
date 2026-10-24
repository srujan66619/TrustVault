# TrustVault — Threat Model & Manual Verification Guide (THREATS.md)

## 1. Overview & Security Philosophy
In TrustVault, **security is the core product, not a feature**. Every access decision must be strictly verified, every sensitive action audit-logged in a tamper-evident chain, and all file interactions isolated through private channels.

This document serves two purposes:
1. **The Formal Threat Model**: Identifies assets, adversaries, threats (STRIDE), mitigations, and accepted risks.
2. **The Manual Verification & Flaw-Hunting Guide**: Explicitly documents potential developer mistakes, implementation oversights, and step-by-step instructions to manually test and prove whether a mistake exists in the application.

---

## 2. Threat Modeling Matrix (STRIDE)

| Threat ID | Category | Threat Description | Mitigation Strategy | Test Coverage / Status | Accepted Risk / Justification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TH-01** | **Elevation of Privilege** | User manipulates document ID (IDOR) to view or download documents belonging to another user. | Centralized `authorize(userId, docId, action)` queries database permissions directly. Deny by default. | Automated test & manual curl verification. | None accepted. |
| **TH-02** | **Information Disclosure** | Unauthorized attempt reveals document existence via HTTP 403 Forbidden instead of 404 Not Found. | For unauthorized attempts by non-owners/non-viewers, return uniform `404 Not Found`. Internal log records `ACCESS_DENIED`. | Test verifies HTTP 404 status code and identical response body to non-existent document. | None accepted. |
| **TH-03** | **Repudiation / Tampering** | Malicious actor or rogue admin modifies or deletes audit logs to hide unauthorized activity. | Cryptographic hash chain (`prev_hash`, `row_hash`). DB-level triggers raising exception on `UPDATE`/`DELETE`/`TRUNCATE`. | Hash chain validation script & DB rejection tests. | None accepted. |
| **TH-04** | **Stale Authorization** | Revoked user continues accessing documents because permissions are cached in JWT or Redis. | Zero caching. Every single document route runs live DB query inside `authorize()`. Check user is `ACTIVE`. | Test: grant access -> verify -> revoke access -> immediate subsequent request must return 404. | Read load on DB for every request (justified: security is prioritized over micro-optimizations). |
| **TH-05** | **File Execution / XSS** | Attacker uploads malicious file (SVG with `<script>`, HTML, polyglot `.exe`) to execute in victim's browser. | Magic byte sniffing via allow-list. Disallow SVG, HTML, archives, and executables. Serve downloads with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. | Upload rejection tests with polyglot and spoofed files. | None accepted. |
| **TH-06** | **Storage Path Traversal** | Attacker specifies `../../secret.pdf` or creates object keys overwriting existing user documents. | Server discards client filename for storage. Generates random UUID server-side as storage object name. Private Supabase bucket. | Unit & integration tests on storage abstraction. | Original filename sanitized and stored solely in database metadata. |
| **TH-07** | **Self-Escalation** | Viewer updates their role to ADMIN or OWNER via profile update endpoint. | Role column in `profiles` protected by DB RLS and server API validation. Never trust client payload. | Profile update endpoint penetration test. | None accepted. |
| **TH-08** | **Information Leak via Search/List** | User lists documents, and query returns titles/metadata of unauthorized documents before in-memory filtering. | DB-level authorization filter: `WHERE` clause joins active grants. Never fetch-then-filter in Node.js. | List query test asserting zero leaked rows in SQL result. | None accepted. |

---

## 3. Manual Verification Guide: Mistakes to Probe & How to Detect Them

During live judging or code reviews, reviewers actively look for specific mistakes and shortcuts. Below is the manual test protocol to intentionally expose these mistakes.

---

### Mistake 1: Revocation Latency (Cached Permissions or JWT Claims)
* **The Mistake**: The developer puts permissions in the JWT session token or caches permissions in memory/Redis with a TTL (e.g., 5 minutes). When an owner revokes access, the revoked user can still view or download the file until the cache/token expires.
* **Why it fails**: Violates Core Security Promise #3: *"Revoking access takes effect immediately."*
* **Manual Verification Procedure**:
  1. User A (Owner) grants `VIEWER` access on `Doc-123` to User B.
  2. User B requests `GET /api/documents/Doc-123` using their bearer token. Confirm HTTP 200.
  3. User A sends `POST /api/documents/Doc-123/revoke` targeting User B.
  4. User B immediately repeats `GET /api/documents/Doc-123` with the exact same session token.
  * **Pass Condition**: HTTP 404 Not Found immediately on step 4.
  * **Fail Condition**: HTTP 200 OK (stale cache) or HTTP 403 Forbidden (leaks existence).

---

### Mistake 2: IDOR Response Discrepancy (Information Enumeration)
* **The Mistake**: The application returns `404 Not Found` when a document does not exist, but returns `403 Forbidden` or `401 Unauthorized` when the document exists but the caller is not authorized.
* **Why it fails**: Allows an attacker to brute-force document UUIDs or IDs to confirm which document IDs exist on the server.
* **Manual Verification Procedure**:
  1. Make a request to a completely bogus UUID:
     ```bash
     curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer USER_B_TOKEN" \
       https://trustvault.example.com/api/documents/00000000-0000-0000-0000-000000000000
     ```
     Observe output: `404`.
  2. Make a request to a real document owned by User A (which User B has no access to):
     ```bash
     curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer USER_B_TOKEN" \
       https://trustvault.example.com/api/documents/REAL-DOC-UUID-OF-USER-A
     ```
  * **Pass Condition**: Both requests return identical HTTP 404 status codes and identical generic response payloads (`{"error": "Document not found"}`). Internal audit log shows `ACCESS_DENIED`.
  * **Fail Condition**: Step 2 returns HTTP 403 or a distinct error message ("You do not have access").

---

### Mistake 3: Client-Supplied MIME Type Trust & SVG Stored XSS
* **The Mistake**: The backend accepts `Content-Type: image/svg+xml` or inspects only the client-sent file extension `.pdf` while the actual payload is an HTML/JavaScript executable or SVG file.
* **Why it fails**: If the file is stored and served inline, the browser executes the script in the context of the platform domain, hijacking cookies and sessions.
* **Manual Verification Procedure**:
  1. Create a file named `malicious.pdf` containing:
     ```xml
     <svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>
     ```
  2. Upload via upload endpoint:
     ```bash
     curl -X POST -H "Authorization: Bearer TOKEN" -F "file=@malicious.pdf;type=application/pdf" \
       https://trustvault.example.com/api/documents/upload
     ```
  * **Pass Condition**: Upload rejected with HTTP 400 Bad Request ("Invalid file format / magic byte mismatch").
  * **Fail Condition**: Upload succeeds because the server trusted the client's `type=application/pdf` or `.pdf` extension without checking binary magic bytes (`%PDF-`).

---

### Mistake 4: Audit Log Bypass (Silent Failure When Audit Fails)
* **The Mistake**: The developer wraps audit log creation in a non-blocking `try/catch` block that suppresses errors:
  ```typescript
  try {
    await auditLog(...);
  } catch (err) {
    console.error("Audit log failed, but allowing request to succeed");
  }
  ```
* **Why it fails**: If the audit database is unavailable or a row fails to write, sensitive document downloads or deletions take place without an audit trail, violating non-repudiation.
* **Manual Verification Procedure**:
  1. In a staging/test environment, temporarily revoke `INSERT` permissions on `audit_logs` or induce a schema violation.
  2. Attempt a sensitive action (e.g., download a document or grant access).
  * **Pass Condition**: The operation fails with HTTP 500 ("Security audit logging failed; operation aborted"). Document is not downloaded or modified.
  * **Fail Condition**: Operation succeeds and returns document content without an audit record.

---

### Mistake 5: Tampered Audit Row Detection (Cryptographic Hash-Chain Verification)
* **The Mistake**: Audit logs are simple auto-increment rows. A database superuser or SQL-injection attacker edits a row (e.g. changing `result: ACCESS_DENIED` to `result: ACCESS_GRANTED`) and the system does not detect it.
* **Why it fails**: Fails Core Security Promise #2: *"Allowed and denied access attempts are recorded in a tamper-evident audit trail."*
* **Manual Verification Procedure**:
  1. Run the audit log verification script:
     ```bash
     npm run audit:verify
     ```
     Observe output: `Audit chain integrity valid: 150/150 blocks verified.`
  2. Directly in Postgres (as admin), alter a single row:
     ```sql
     UPDATE audit_logs SET action = 'DOCUMENT_VIEW' WHERE id = 'some-uuid';
     ```
     *(Note: If DB triggers are active, the update itself will be blocked with an exception; if triggered via bypass or raw file manipulation, step 3 tests detection).*
  3. Re-run `npm run audit:verify`.
  * **Pass Condition**: Verification fails immediately:
    `Tampering detected at row some-uuid: expected row_hash X, found Y. Chain broken.`
  * **Fail Condition**: Verification reports success despite the altered record.

---

### Mistake 6: In-Memory "Fetch All Then Filter" in Search/Listing
* **The Mistake**: The developer runs `SELECT * FROM documents;` and filters out unauthorized documents using JavaScript (`docs.filter(doc => userCanAccess(doc))`).
* **Why it fails**: 
  1. Huge performance and memory flaw.
  2. If the JavaScript filter has a bug or pagination is applied before filtering, unauthorized document metadata leaks into user responses.
* **Manual Verification Procedure**:
  1. Enable database query logging (`supabase db logs` or Postgres statement logging).
  2. Perform a search: `GET /api/documents?query=financial`.
  3. Inspect the executed SQL in database logs.
  * **Pass Condition**: SQL includes explicit `JOIN document_permissions dp ON ... WHERE dp.user_id = $1`.
  * **Fail Condition**: SQL runs `SELECT * FROM documents WHERE title ILIKE '%financial%'` without tenant/user authorization constraints in the SQL query itself.

---

### Mistake 7: Direct Object Key Traversal in Storage
* **The Mistake**: Backend constructs storage paths using user-supplied parameters: `bucket.upload('user-uploads/' + file.name)`.
* **Why it fails**: A filename like `../../system/config.env` or identical filename collisions can overwrite files or access unauthorized paths.
* **Manual Verification Procedure**:
  1. Upload a file with filename `../../test.txt` or `userB_document.pdf`.
  2. Inspect the Supabase Storage bucket via SQL or dashboard.
  * **Pass Condition**: File is stored strictly as `<UUID-V4>` with no user input in the storage path.
  * **Fail Condition**: File path matches user-supplied string or contains path traversal segments.

---

### Mistake 8: Disabled User Access via Unexpired Session
* **The Mistake**: An administrator sets `is_active = FALSE` on a compromised user account in the `profiles` table. However, the user's Supabase JWT is valid for another 45 minutes, so the user can continue downloading documents.
* **Why it fails**: Administrative account suspension must be instant.
* **Manual Verification Procedure**:
  1. Log in as User B, obtain a valid JWT token.
  2. Admin sets `is_active = FALSE` in `profiles` for User B.
  3. User B requests `GET /api/documents`.
  * **Pass Condition**: HTTP 401/403 ("Account suspended") on the very next request.
  * **Fail Condition**: HTTP 200 OK because the server only verified the JWT signature without querying account status in the database.

---

## 4. Hostile Reviewer Quick-Test Checklist
Reviewers can execute these 5 rapid tests to evaluate TrustVault's security:
- [ ] **Test A**: Invert or comment out `if (!isAuthorized) return notFound();` in `authorize()` and run `npm test` -> Test suite must fail.
- [ ] **Test B**: Send a spoofed PNG file with embedded PHP/shell -> Upload rejected by magic byte validator.
- [ ] **Test C**: Alter a row in `audit_logs` -> `npm run audit:verify` flags broken hash chain.
- [ ] **Test D**: Attempt to access another user's document ID -> Exactly matches 404 response of non-existent ID.
- [ ] **Test E**: Revoke a user and immediately retry download -> Denied on 1st millisecond with zero delay.

---

## 5. Phase 1: Application Foundation Threat & Risk Status

| Risk ID | Phase 1 Threat | Actual Mitigation in Phase 1 | Status / Test Method | Unresolved / Accepted Risk |
| :--- | :--- | :--- | :--- | :--- |
| **P1-01** | **Secret Exposure via Git**: `.env.local` or service role keys committed to GitHub. | `.gitignore` explicitly ignores `.env*` while tracking `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` is completely excluded from runtime code. | Verified via `git status --ignored` showing `.env.local` is ignored. | Developer must remain disciplined never to commit credentials with `git add -f`. |
| **P1-02** | **False Sense of Security from Placeholder UI**: Users/reviewers assuming documents can be uploaded/secured based on UI. | Layout and Home page explicitly state in prominent banners that document sharing and security controls are **strictly not implemented yet**. | Verified by inspecting UI at `http://localhost:3000`. | None. Transparency prevents misleading claims. |
| **P1-03** | **Client/Server Boundary Leakage**: Server Supabase client accidentally bundled into browser JS code. | `src/lib/supabase/server.ts` uses `import 'server-only'`, causing compile-time Next.js build failure if imported in a client component. | Verified by Next.js compiler check and production build (`npm run build`). | None. Enforced at compiler level. |
| **P1-04** | **Missing Environment Variables**: Application failing silently or in an insecure open state on invalid env. | `client.ts` and `server.ts` throw explicit configuration errors if `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing. | Verified by unit inspection. | Application must have `.env.local` configured to interact with Supabase in future phases. |

---

## 6. Phase 2: Database Schema & Supabase Security Baseline Threat Analysis

| Threat ID | Phase 2 Threat | Actual Mitigation in Phase 2 | Status / Verification Method | Unresolved / Accepted Risk |
| :--- | :--- | :--- | :--- | :--- |
| **P2-01** | **Role & Status Escalation**: Authenticated user attempts `UPDATE profiles SET role = 'ADMIN'` or resets `status = 'ACTIVE'`. | 1. RLS policy prevents update.<br>2. Trigger `trg_prevent_profile_privilege_escalation` raises exception if client (`authenticated` or `anon`) modifies `role` or `status`. | Verified in `supabase/verify_schema.sql` via role modification check. | Direct database superuser access can alter roles (intended administrative channel). |
| **P2-02** | **Overly-Permissive RLS**: A policy inadvertently grants access to all authenticated users (`TO authenticated USING (true)`). | Every table has RLS explicitly enabled (`ENABLE ROW LEVEL SECURITY`) with `NO FORCE` so `SECURITY DEFINER` functions execute cleanly without infinite recursion. Deny-by-default applied. Zero global `USING (true)` policies exist. | Verified by auditing migration policies. | RLS policies rely on Supabase `auth.uid()` which requires valid JWT verification. |
| **P2-03** | **Direct Audit Log Tampering / Injection**: Client attempts `INSERT`, `UPDATE`, or `DELETE` on `audit_logs` to forge or cover up actions. | 1. Zero client-facing `INSERT`, `UPDATE`, or `DELETE` RLS policies.<br>2. Row trigger `trg_prevent_audit_log_mutation` aborts any `UPDATE` or `DELETE` attempt.<br>3. Statement trigger `trg_prevent_audit_log_truncate` blocks `TRUNCATE`. | Verified in `verify_schema.sql`. | Migration currently lacks cryptographic hash chain computation (scheduled for Phase 4). |
| **P2-04** | **Owner-Removal & Self-Grantee Inversion**: An attacker adds the document owner as a grantee, or attempts to revoke the owner's ownership. | 1. Trigger `trg_check_grantee_not_owner` rejects inserting owner as grantee.<br>2. Ownership lives in `documents.owner_id`, not in `document_permissions`. Only the owner can revoke permissions. | Verified in `verify_schema.sql` (owner-as-grantee insertion blocked). | None at database schema level. |
| **P2-05** | **Duplicate Grants Race Condition**: Rapid concurrent grant requests cause duplicate permission rows with conflicting rights. | Database-level unique constraint `uq_document_grantee UNIQUE (document_id, grantee_id)`. | Verified in `verify_schema.sql` (duplicate grant raises `unique_violation`). | None. Engine-level guarantee. |
| **P2-06** | **Soft-Delete Information Leakage**: Soft-deleted documents (`deleted_at IS NOT NULL`) leak via search or permission joins. | All `documents` and `document_permissions` RLS policies explicitly enforce `deleted_at IS NULL`. | Verified by inspecting RLS policy definitions. | Application queries must also explicitly filter `deleted_at IS NULL` for query optimizer performance. |
| **P2-07** | **Privilege Escalation on Signup**: Attacker sends `{"role": "ADMIN"}` in `auth.signUp()` user metadata. | Trigger `handle_new_user()` on `auth.users` uses `SECURITY DEFINER` with fixed `search_path = public, pg_temp` and strictly hardcodes `role = 'VIEWER'`, ignoring all user metadata. | Verified by inspecting trigger definition. | Initial admin account must be seeded via trusted database script or Supabase dashboard. |
| **P2-08** | **Direct Client Permission Modification (Audit Bypass)**: Direct client `INSERT`/`DELETE` on `document_permissions` bypasses server `authorize()` and skips audit logging. | Removed all client `INSERT`, `UPDATE`, and `DELETE` policies on `document_permissions`. Only `SELECT` is permitted for active owners and grantees. | Verified in `verify_schema.sql` (client direct insert denied). | Server-side grant/revoke procedures must be built in future phases with non-skippable audit writes. |
| **P2-09** | **Disabled User JWT Reuse**: Disabled user with valid unexpired JWT continues accessing documents. | RLS policies on `documents`, `document_permissions`, and `audit_logs` explicitly check `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'ACTIVE')`. | Verified in `verify_schema.sql` (disabled user receives 0 rows). | Read overhead on profiles for RLS evaluation (acceptable trade-off for instant revocation). |
| **P2-10** | **Postgres Syntax Error on TRUNCATE Trigger**: Creating a `FOR EACH ROW` trigger on TRUNCATE raises a PostgreSQL engine error. | Separated triggers: `trg_prevent_audit_log_mutation` is `FOR EACH ROW` (UPDATE/DELETE), while `trg_prevent_audit_log_truncate` is `FOR EACH STATEMENT` (TRUNCATE). | Verified syntax against Postgres specifications. | None. Valid statement-level trigger. |
| **P2-11** | **Direct Client Document Modification (Audit & Authz Bypass)**: Client attempts direct `INSERT`, `UPDATE`, or `DELETE` on `documents` via Supabase SDK. | Removed all client `INSERT`, `UPDATE`, and `DELETE` RLS policies from `documents`. All writes must be server-mediated through routes enforcing `authorize()` and audit logs. | Verified in `verify_schema.sql` (client INSERT and UPDATE denied). | Server-side endpoints must be implemented in future phases. |
| **P2-12** | **Viewer Self-Elevation to Document Owner**: A `VIEWER` attempts to create or own a document, acquiring owner permissions. | Trigger `trg_check_document_owner_role` rejects document insertion or owner updates unless `owner_id` references an ACTIVE profile with `role IN ('OWNER', 'ADMIN')`. | Verified in `verify_schema.sql` (Viewer-owned document creation blocked). | None. Enforced at database engine level. |
| **P2-13** | **Infinite RLS Policy Recursion (PostgreSQL Error 42P17)**: Mutual cross-table checks between `documents` and `document_permissions` trigger cyclic RLS evaluation when `documents` checks `document_permissions` and `document_permissions` checks `documents`. | 1. Denormalized `owner_id` onto `document_permissions` (synced and validated via trigger `trg_sync_document_permission_owner`).<br>2. Updated `permissions_select_owner` policy to check `owner_id = auth.uid()` directly without querying `documents`. This transforms the RLS dependency into a strictly acyclic directed graph (DAG): `audit_logs -> documents -> document_permissions -> profiles`.<br>3. Removed `FORCE ROW LEVEL SECURITY` and implemented helper functions in procedural `LANGUAGE plpgsql`. | Verified in `verify_schema.sql` across all 23 test contexts. | None. Elimination of cross-table circularity guarantees impossibility of recursion. |

> [!NOTE]
> **Live Verification Status**: Verified live on the active Supabase project (`mgqrzzbyzuyygufcpaun`, PostgreSQL 17.11) via the Supabase MCP. All 23 security verification checks in `supabase/verify_schema.sql` executed in a single transaction and **PASSED (100% green)**, with zero persistent test data left behind.

---

## 7. Phase 3: Authentication & Centralized Server-Side Authorization Threat Analysis

| Threat ID | Phase 3 Threat | Actual Mitigation in Phase 3 | Status / Verification Method | Unresolved / Accepted Risk |
| :--- | :--- | :--- | :--- | :--- |
| **P3-01** | **Stale Claims in JWT**: User whose role or status changed in the database continues accessing resources using stale JWT claims. | `getCurrentUser()` and `authorize()` **never** trust JWT metadata or custom claims. Every authorization decision looks up live `profiles.role` and `profiles.status` directly from PostgreSQL. | Verified in `tests/authorization.test.ts` (mutating status immediately denies access). | Database query overhead per authorization decision (acceptable cost for strict freshness). |
| **P3-02** | **Disabled-User Session Persistence**: Suspended/disabled user with an unexpired session cookie continues executing requests. | `requireAuth()` and `authorize()` check `profiles.status === 'ACTIVE'`. If `DISABLED`, immediately rejects with `ACCOUNT_DISABLED`. | Verified in `tests/authorization.test.ts` (Test 5: disabled user denied all actions). | Active WebSocket/Realtime subscriptions (if added in future phases) must also listen for status revocation events. |
| **P3-03** | **Client-Side Role & Parameter Tampering**: Attacker sends `{"role": "ADMIN"}` or passes spoofed `userId` in query parameters. | `userId` is obtained strictly from the verified session via `supabase.auth.getUser()`. Client-provided roles and IDs are completely ignored. Parameter validation regex enforces valid UUID structure. | Verified in `tests/authorization.test.ts` (Test 1: malformed inputs rejected). | None. Client input is untrusted by design. |
| **P3-04** | **Insecure Direct Object Reference (IDOR)**: Attacker passes arbitrary `documentId` UUIDs to read, edit, or delete other users' documents. | Centralized choke-point `authorize(userId, documentId, action)` is mandatory. Evaluates ownership and explicit grants. Unrelated users are denied. | Verified in `tests/authorization.test.ts` (Test 6: unrelated user denied). | Downstream Route Handlers (Phase 4/5) must strictly call `authorize()` before invoking storage or database writes. |
| **P3-05** | **Document Existence Enumeration**: Attacker probes UUIDs to determine which documents exist based on differing error codes (404 vs 403). | `authorize()` returns an identical `NOT_FOUND_OR_DENIED` result for nonexistent documents, soft-deleted documents, and unauthorized access attempts. | Verified in `tests/authorization.test.ts` (Tests 6, 7, 8 all return identical `NOT_FOUND_OR_DENIED`). | Timing attacks: database query duration could theoretically reveal nonexistence vs existence (difference is negligible at normal indexing). |
| **P3-06** | **Rogue Administrator Document Snooping**: Privileged administrator abuses `ADMIN` role to inspect or download confidential user files without authorization. | Zero-trust admin scoping: `ADMIN` role grants `VIEW_AUDIT` for compliance auditing, but does **not** grant automatic read/download/edit bypass to private documents without explicit grant. | Verified in `tests/authorization.test.ts` (Test 9: Admin denied private document content). | Database superuser (`postgres`) with direct database connection has raw access (out of application threat model). |
| **P3-07** | **Service Role Key Client Leakage**: Privileged Supabase client accidentally bundled into browser JavaScript. | `src/lib/supabase/admin.ts` imports `'server-only'`, throwing a build-time compiler error if imported in client components. Variable `SUPABASE_SERVICE_ROLE_KEY` is never prefixed with `NEXT_PUBLIC_`. | Verified by Next.js build compilation. | Developer must never commit `.env.local` containing the real service role key. |

---

## 8. Phase 4: Tamper-Evident Audit-Log Infrastructure Threat Analysis

| Threat ID | Phase 4 Threat | Actual Mitigation in Phase 4 | Status / Verification Method | Unresolved / Accepted Risk |
| :--- | :--- | :--- | :--- | :--- |
| **P4-01** | **Audit Log Modification or Deletion (Tampering)**: Attacker with database access attempts to alter or purge historical audit records to hide exfiltration. | 1. Row-level trigger `trg_prevent_audit_log_mutation` strictly rejects `UPDATE` and `DELETE`.<br>2. Statement-level trigger `trg_prevent_audit_log_truncate` blocks `TRUNCATE`.<br>3. Continuous SHA-256 hash chaining (`prev_hash`, `row_hash`) detects modified payload data, altered hashes, and broken links. | Verified live in `verify_audit_security_baseline` (Tests 2, 3, 4, 10, 11, 12). | Database superuser with raw disk or trigger disabling privilege can bypass internal database controls (see P4-06). |
| **P4-02** | **Concurrent Append Chain Forking**: Simultaneous requests read identical `prev_hash` before committing, creating divergent or conflicting branches. | Database procedure `append_audit_log` acquires a transaction-scoped advisory lock (`pg_advisory_xact_lock(8273619283746152431)`), serializing all appends into a strictly monotonic, single-line chain with zero sequence gaps. | Verified live in `verify_audit_security_baseline` (Tests 1, 5). | Transaction serialization introduces a slight throughput ceiling on global audit writes (sufficient for high-security vault workloads). |
| **P4-03** | **Direct Client Audit Injection / Spoofing**: Malicious client invokes PostgREST `INSERT` or RPC `append_audit_log` with fabricated actor IDs or actions. | 1. Direct table write privileges (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`) on `audit_logs` are revoked from `anon` and `authenticated`.<br>2. `append_audit_log` execute privilege is revoked from `PUBLIC`, `anon`, and `authenticated`; granted solely to `service_role`. | Verified live in `tests/audit.test.ts` (anon execution blocked with 42501 `permission denied`). | Server-side endpoints in later phases must never accept unauthenticated or unvalidated metadata payloads from client requests. |
| **P4-04** | **Audit Identifier Erasure on Deletion**: Document or user deletion triggers `ON DELETE SET NULL`, erasing references from historical logs or violating append-only triggers. | Dropped `audit_logs_actor_id_fkey` and `audit_logs_document_id_fkey`. Historical records permanently preserve target UUIDs, and IDOR probes against non-existent document UUIDs are safely logged without constraint errors. | Verified live in `verify_audit_security_baseline` (Test 14: non-existent document ID logged). | If an entity is deleted, looking up its metadata requires inspecting historical audit records or soft-deleted tombstone rows. |
| **P4-05** | **Audit Write Failure Bypass (Fail-Open Logging)**: Downstream sensitive route executes access or grant even if the required audit write fails. | `logAuditEvent()` in `src/lib/audit/audit.ts` **fails closed**: any database rejection, lock timeout, or constraint failure throws `AuditLoggingError`. Routes must abort sensitive actions if this function throws. | Verified in `tests/audit.test.ts` (throws `AuditLoggingError` on write failure). | Developers must ensure future route handlers properly `await` audit writes before returning sensitive document streams or tokens. |
| **P4-06** | **Privileged Database Superuser Access (Accepted Infrastructure Risk)**: A cloud database superuser (`postgres` or cloud host admin) executes `ALTER TABLE DISABLE TRIGGER`, updates historical rows, and recomputes hashes. | Documented as an **accepted infrastructure-level risk**. In-database cryptographic chains guarantee immutability against web application compromises and standard database roles, but cannot defend against root/superuser database ownership without external ledger anchoring or write-once storage (WORM). | Documented and accepted in project charter and threat model. | For production enterprise compliance, audit logs should be mirrored in real-time to an immutable external ledger or append-only cloud storage bucket. |
| **P4-07** | **Service Role Direct Audit Table Write Bypass**: Server-side code holding the service role key directly executes `INSERT` on `public.audit_logs`, bypassing `append_audit_log`, transaction advisory locking, and SHA-256 hash calculation. | Applied corrective migration `20261023020000_audit_service_role_lockdown.sql`: revoked direct `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` privileges on `public.audit_logs` from `service_role`. Granted only `SELECT`. Appending audit records is permitted exclusively through `public.append_audit_log(...)` (which operates via `SECURITY DEFINER` owned by `postgres`). | Verified live in `verify_audit_security_baseline` (Tests 9, 10, 11) and `tests/audit.test.ts`. Direct INSERT by `service_role` is denied; RPC append succeeds and verifies against hash chain. | None. Even server-side code is barred from un-serialized or un-hashed direct table inserts. |
| **P4-08** | **Extraneous Table Privileges & Browser Audit Verification Scan Abuse**: `service_role` holding unnecessary `REFERENCES` or `TRIGGER` table privileges, and `authenticated` role retaining `EXECUTE` on `verify_audit_chain` allowing untrusted clients to trigger expensive verification queries. | Applied corrective migration `20261024010000_audit_least_privilege_final.sql`: executed `REVOKE ALL ON TABLE public.audit_logs FROM service_role` and granted strictly `SELECT`. Executed `REVOKE ALL ON FUNCTION public.verify_audit_chain(bigint, integer) FROM PUBLIC, anon, authenticated` and granted `EXECUTE` solely to `service_role`. Preserved exclusive `append_audit_log` execution on `service_role`. | Verified live via Supabase MCP: `information_schema.table_privileges` confirms `service_role` has only `SELECT` (no REFERENCES, TRIGGER, INSERT, UPDATE, DELETE, TRUNCATE); `has_function_privilege` confirms `anon` and `authenticated` cannot execute either audit routine. | None. Strict principle of least privilege enforced across tables and routines. |

---

## 9. Phase 5: Secure Document Access & File Handling Threat Analysis

| Threat ID | Phase 5 Threat | Actual Mitigation in Phase 5 | Status / Verification Method | Unresolved / Accepted Risk |
| :--- | :--- | :--- | :--- | :--- |
| **P5-01** | **Insecure Direct Object Reference (IDOR)**: Attacker tampers with document UUID in `/api/documents/[id]` or `/api/documents/[id]/download` to access or download another user's private files. | Every single-document route handler invokes centralized `authorize(userId, documentId, action)` using exact actions (`'DOWNLOAD'` for downloads, `'READ'` for metadata). Evaluates profile status, document ownership, and active permission grants. Returns uniform 404 (`NOT_FOUND_OR_DENIED`) for nonexistent, soft-deleted, and unauthorized records to prevent enumeration. | Verified in `tests/documents.test.ts` (exact DOWNLOAD and READ action branches verified; unrelated user access denied with 404). | None. Centralized authorization choke-point enforced before reading or streaming. |
| **P5-02** | **Direct Browser Storage Exposure**: Attacker uses browser client with `anon` or `authenticated` role to download, upload, list, or delete objects directly in Supabase Storage (`supabase.storage.from('documents')`). | Storage bucket `documents` created with `public: false`. Row-Level Security on `storage.objects` is enabled with zero policies granted to `anon` or `authenticated`. All client storage access is rejected by PostgreSQL; file operations are mediated exclusively through server route handlers using `service_role`. | Verified in `tests/documents.test.ts` and `supabase/verify_phase5_security.sql` (direct client storage download and list rejected). | Server-side code must safeguard `SUPABASE_SERVICE_ROLE_KEY` and never expose it to client bundles. |
| **P5-03** | **Stale / Leaked Signed URLs**: Attacker captures or reuses a pre-signed download URL after permissions have been revoked or document deleted. | Architectural ban on signed download URLs (`createSignedUrl`). File bytes are streamed directly through Next.js server route handlers. Re-authorization is evaluated immediately prior to initiating the stream; revoked grants or deleted records are denied instantly on the next request. | Verified in `tests/documents.test.ts` (revoked permission immediately blocks subsequent download). | Streaming through server routes consumes server bandwidth and memory compared to direct CDN offload (acceptable security trade-off). |
| **P5-04** | **Magic-Byte Spoofing & MIME Forgery**: Attacker renames an executable, script, or polyglot file to `.pdf` or spoofs `Content-Type: application/pdf` to bypass upload filters. | Client-supplied MIME type is completely ignored. Validation inspects both file extension allow-list (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.txt`) and real byte headers (magic bytes: `%PDF-`, PNG signature `89 50 4E 47`, JPEG SOI `FF D8 FF`, UTF-8 text validation without control/null bytes). Mismatched extensions or fake magic bytes are rejected. | Verified in `tests/documents.test.ts` (MIME spoofing, fake magic bytes, and mismatched extensions rejected). | Polyglot files combining valid magic bytes with embedded payloads (mitigated by strict nosniff and attachment headers). |
| **P5-05** | **Path Traversal via Filename**: Attacker supplies malicious filenames containing `../`, `..\\`, absolute paths, or null bytes (`%00`) to escape designated storage paths. | `sanitizeFilename()` removes directory traversal sequences (`..`), forward/backward slashes, null bytes, and non-printable control characters. Physical storage keys are generated server-side as pure random UUIDs (`crypto.randomUUID()`), completely decoupling user filenames from storage object paths. | Verified in `tests/documents.test.ts` (traversal filenames sanitized, random UUID paths verified). | None. Filename is treated as display-only metadata, never as an object storage key. |
| **P5-06** | **Stored XSS & Dangerous Content Types (SVG/HTML)**: Attacker uploads SVG with embedded `<script>` or HTML files rendered inline by the browser. | SVG, HTML, XHTML, XML, and executables are strictly rejected. Allowed types restricted to PDF, PNG, JPEG, and plain text. Download routes strictly set `Content-Disposition: attachment; filename="..."`, `X-Content-Type-Options: nosniff`, and server-determined allow-listed `Content-Type`. Unsafe characters in download header filenames are sanitized. | Verified in `tests/documents.test.ts` (SVG/HTML rejected, response headers verified). | User opening downloaded files locally on insecure client PDF viewers (client-side endpoint risk). |
| **P5-07** | **Memory Exhaustion & Oversized File DoS**: Attacker uploads gigabyte-sized files to exhaust server memory and crash the server runtime. | Strict 15MB file size limit enforced in memory stream buffer validation (`validateFileBuffer`) and configured on the Supabase storage bucket (`file_size_limit: 15728640`). Non-file inputs are bounded by Zod schema constraints. | Verified in `tests/documents.test.ts` (oversized 16MB file rejected). | High concurrency of simultaneous 15MB uploads could increase memory pressure (mitigated by streaming limits and rate limiting in future phases). |
| **P5-08** | **List / Search RPC IDOR & Metadata Snooping**: Attacker invokes `list_accessible_documents` supplying a victim's UUID in `p_user_id` to inspect document titles and metadata. | Function does not trust caller-supplied `p_user_id`. Derives identity securely from `auth.uid()` for client callers. If an authenticated caller supplies `p_user_id <> auth.uid()`, the RPC returns zero rows (IDOR defense). Anonymous and disabled users receive zero rows. As defense-in-depth, every returned row is verified through `authorize(userId, doc.id, 'READ')` before serialization. | Verified in `supabase/verify_phase5_security.sql` and `tests/documents.test.ts` (mismatched user receives 0 rows). | Search indexing volume on encrypted or private metadata (RPC uses parameter bindings and index-friendly filters). |
| **P5-09** | **Audit Failure Bypass (Fail-Open Execution) & Metadata-Audit Desynchronization**: Attacker exploits database errors to insert document metadata without an audit record, or writes audit records without metadata. | Server-only atomic database procedure `public.create_document_and_audit(...)` creates document metadata and appends the `DOCUMENT_CREATE` audit event in a single PostgreSQL transaction. If audit append fails, metadata insertion is automatically rolled back. If the procedure fails, the server compensating routine deletes the uploaded storage object. | Verified in `supabase/verify_phase5_security.sql` and `tests/documents.test.ts` (transaction atomicity and compensation confirmed). | Compensating storage deletion call could theoretically encounter network failure during partition (reconciliation job can clean orphaned storage keys). |
| **P5-10** | **Search Term & Content Leakage in Audit Trails**: Attacker searches for sensitive terms or document queries; storing raw search queries in audit logs creates secondary data exposure. | List and search audit logging records only structural boolean metadata (`has_search: true/false`, `has_category: true/false`, and returned count). Raw search query text, category filter strings, and document contents are strictly excluded from audit event metadata. | Verified in `tests/documents.test.ts` (auditing validated for allowed and denied requests with zero raw search leakage). | None. Search queries remain in-memory and ephemeral. |










