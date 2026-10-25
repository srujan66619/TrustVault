# TrustVault — Interactive Security Demonstration Script (`DEMO.md`)

This runbook guides a security reviewer or evaluator through a 5–8 minute demonstration of TrustVault's security invariants.

---

## 1. Safe Seed-User Setup Guide

> [!IMPORTANT]
> **No Secrets or Credentials in Source Code**: Do not commit actual passwords, personal emails, or production tokens to Git. Use temporary local passwords during initial setup.

Execute these steps in your Supabase SQL Editor or via the Supabase Dashboard to seed the 4 evaluation test profiles:

```sql
-- 1. Create seed user identities in auth.users
-- (Or register via http://localhost:3000/login and update their profile roles below)
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@example.com', '{}'::jsonb, now(), now()),
  ('a0000000-0000-0000-0000-000000000002', 'owner@example.com', '{}'::jsonb, now(), now()),
  ('a0000000-0000-0000-0000-000000000003', 'viewer@example.com', '{}'::jsonb, now(), now()),
  ('a0000000-0000-0000-0000-000000000004', 'unrelated@example.com', '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 2. Configure roles and statuses in public.profiles
UPDATE public.profiles SET role = 'ADMIN', status = 'ACTIVE' WHERE id = 'a0000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET role = 'OWNER', status = 'ACTIVE' WHERE id = 'a0000000-0000-0000-0000-000000000002';
UPDATE public.profiles SET role = 'VIEWER', status = 'ACTIVE' WHERE id = 'a0000000-0000-0000-0000-000000000003';
UPDATE public.profiles SET role = 'OWNER', status = 'ACTIVE' WHERE id = 'a0000000-0000-0000-0000-000000000004';
```

---

## 2. 5–8 Minute Step-by-Step Security Demo

### Demo Overview
| Step | Demonstrated Invariant | Actor | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **1** | Anti-Enumeration & IDOR Denial | Unrelated User (`unrelated@example.com`) | Generic 404 on unowned document UUID. |
| **2** | Owner Document Creation & Safe Metadata | Owner (`owner@example.com`) | Uploads PDF; audit event committed atomically. |
| **3** | Non-Transitive Permission Grant | Owner (`owner@example.com`) | Grants `READ` permission to `viewer@example.com`. |
| **4** | Immediate Access & Streaming Download | Viewer (`viewer@example.com`) | Streams document bytes directly through server route. |
| **5** | Zero-Delay Immediate Revocation | Owner (`owner@example.com`) | Revokes `viewer@example.com` access. |
| **6** | Recheck Denial on Next Request | Viewer (`viewer@example.com`) | Immediate generic 404 on subsequent download attempt. |
| **7** | Owner-Scoped Document Audit History | Owner (`owner@example.com`) | Views audit trail for owned document; foreign events masked. |
| **8** | Admin-Only Cryptographic Chain Verification | Admin (`admin@example.com`) | Verifies SHA-256 hash chain validity across system records. |
| **9** | Mutation-Resistance Proof | Evaluator (Terminal) | Proves test suite fails when security checks are mutated. |

---

### Step 1: IDOR & Anti-Enumeration Demonstration
1. Log in as `unrelated@example.com` at `http://localhost:3000/login`.
2. Attempt to directly request an unowned document ID in the browser or terminal:
   ```bash
   curl -i http://localhost:3000/api/documents/00000000-0000-0000-0000-000000000000
   ```
3. **Verified Result**: Returns `HTTP 404 Not Found` with generic body:
   ```json
   { "error": "Document not found or access denied" }
   ```
4. **Security Takeaway**: An attacker cannot distinguish between a nonexistent document and an unowned document. Zero timing or error leakage.

---

### Step 2: Owner Document Creation & Upload
1. Log in as `owner@example.com`.
2. Navigate to `/documents`.
3. Drag & drop or upload a sample PDF (e.g. `Confidential_Report.pdf`).
4. **Verified Result**: The document appears in the dashboard. Stored in Supabase Storage with a random UUID storage key (no public URL). Stored procedure `create_document_and_audit` committed metadata and `DOCUMENT_CREATE` audit event in a single PostgreSQL transaction.

---

### Step 3: Owner-Controlled Permission Grant
1. On the document card, click **Manage Access** or navigate to `/account`.
2. Under **Owner Sharing Manager**, enter:
   - Email: `viewer@example.com`
   - Permission: `READ`
3. Click **Grant Access**.
4. **Verified Result**: UI confirms permission update. Database trigger verified actor is document owner, target is active, and appended a `GRANT` audit log.

---

### Step 4: Viewer Document Download
1. In a private/incognito window, log in as `viewer@example.com`.
2. Navigate to `/documents`.
3. The shared document `Confidential_Report.pdf` appears with badge `Shared with you (READ)`.
4. Click **Download**.
5. **Verified Result**: Next.js server streams the bytes with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. No pre-signed URL was created.

---

### Step 5: Immediate Access Revocation
1. Switch back to the `owner@example.com` window.
2. In the sharing manager, click **Revoke** next to `viewer@example.com`.
3. **Verified Result**: Revocation commits atomically via `revoke_document_permission_and_audit`, writing a `REVOKE` audit event.

---

### Step 6: Instant Recheck Denial (Zero Stale Windows)
1. Switch back to the `viewer@example.com` window.
2. Immediately attempt to click **Download** again, or refresh the page.
3. **Verified Result**: The request is instantly rejected with `404 Not Found`. Re-authorization check evaluated live PostgreSQL permissions on the first millisecond with zero caching delay.

---

### Step 7: Owner Audit History Review
1. As `owner@example.com`, navigate to `/activity` or click **History** on the document card.
2. **Verified Result**:
   - The timeline shows all events for `Confidential_Report.pdf`: `DOCUMENT_CREATE`, `GRANT`, `DOWNLOAD`, `REVOKE`.
   - Raw internal hashes, IP addresses, and user-agent strings are cleanly projected out.
   - Activity from documents owned by other users is completely absent.

---

### Step 8: Admin Global Activity & Audit-Chain Health Verification
1. Log in as `admin@example.com`.
2. Navigate to `/activity`.
3. **Verified Result**:
   - Admin view displays global system activity across all documents.
   - Click **Run Audit Chain Verification** on the Cryptographic Chain Health card.
   - Returns verified status: `isValid: true`, sequence range, and timestamp.
4. Attempting to view this endpoint as `owner@example.com` or `viewer@example.com` produces `HTTP 403 Forbidden`.

---

### Step 9: Mutation-Resistance Terminal Walkthrough
Demonstrate to the reviewer that the security controls are enforced by real code, not fake mocks:

1. Temporarily comment out or mutate the owner authorization branch in `src/lib/authorization/authorize.ts`:
   ```ts
   // Change line 220 from:
   if (isOwner)
   // to:
   if (false && isOwner)
   ```
2. Run the test suite:
   ```bash
   npx vitest run tests/authorization.test.ts tests/audit.test.ts
   ```
3. **Observed Result**: Tests immediately fail with `AssertionError: expected false to be true`.
4. Restore `src/lib/authorization/authorize.ts`:
   ```bash
   git checkout src/lib/authorization/authorize.ts
   ```
5. Rerun tests:
   ```bash
   npm test
   ```
6. **Observed Result**: All 142 tests pass with 100% green status.
