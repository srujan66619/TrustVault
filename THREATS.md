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

