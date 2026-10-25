# TrustVault

TrustVault is a secure, tamper-evident document-sharing platform engineered with a strict security-first philosophy: **security is the product; CRUD is secondary.**

---

## 1. Clean-Clone Setup

### Prerequisites
* **Node.js**: `>= 20.x` (Tested on Node `v24.17.0`)
* **npm**: `>= 10.x`
* **PostgreSQL Database**: Supabase (Postgres 17+, Auth, Private Storage)

### Installation
```bash
git clone https://github.com/srujan66619/TrustVault.git
cd TrustVault
npm install
```

### Environment Configuration
Copy the sample environment file to `.env.local`:
```bash
cp .env.example .env.local
```

Configure the following variables in `.env.local`:
* `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL (`https://<project-ref>.supabase.co`).
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase public anonymous key (safe for browser exposure; restricted by PostgreSQL RLS).
* `SUPABASE_SERVICE_ROLE_KEY`: Your privileged Supabase service role key (**server-only**; never expose to client bundles or commit to Git).

> [!CAUTION]
> **Secret Key Policy**:
> * `SUPABASE_SERVICE_ROLE_KEY` must never be prefixed with `NEXT_PUBLIC_` or imported into client components. It is strictly guarded by `import 'server-only'` in `src/lib/supabase/admin.ts`.
> * `.env.local` is ignored in `.gitignore`. Real credentials must never be committed.

---

## 2. Supabase Migration Order

To set up or reproduce the live database schema, execute the timestamped SQL migrations in the exact chronological order below (via the Supabase Dashboard SQL Editor or Supabase CLI):

1. `supabase/migrations/20261021000000_secure_schema_baseline.sql` — Profiles, documents, permissions, and initial RLS baseline.
2. `supabase/migrations/20261023010000_tamper_evident_audit_infrastructure.sql` — SHA-256 hash-chained audit logging, monotonic sequences, and mutation triggers.
3. `supabase/migrations/20261023020000_audit_service_role_lockdown.sql` — Revocation of direct write privileges on `audit_logs` from `service_role`.
4. `supabase/migrations/20261024010000_audit_least_privilege_final.sql` — Least-privilege function execution locking on audit verification.
5. `supabase/migrations/20261024020000_storage_setup_and_rpc.sql` — Private storage bucket configuration and `list_accessible_documents` RPC.
6. `supabase/migrations/20261024030000_secure_documents_atomic_upload_and_idor_fix.sql` — Atomic single-transaction document upload and audit logging procedure.
7. `supabase/migrations/20261024040000_secure_sharing_and_revocation.sql` — Owner-controlled permission grant and revocation stored procedures.
8. `supabase/migrations/20261025010000_audit_denied_permissions_and_static_revoke.sql` — Comprehensive auditing of denied permission attempts and static SQL CTE revocation.
9. `supabase/migrations/20261025020000_document_metadata_and_soft_delete_procedures.sql` — Audited stored procedures for metadata updates and soft deletion.
10. `supabase/migrations/20261025030000_documents_least_privilege_lockdown.sql` — Complete revocation of direct mutation privileges on `public.documents`.
11. `supabase/migrations/20261025040000_audit_history_procedures_and_lockdown.sql` — Revocation of direct browser `SELECT` on `audit_logs` and audited server query procedures.

### Verification Scripts
To verify live database privileges, RLS policies, and procedures:
* `supabase/verify_schema.sql` (Phase 2 baseline check)
* `supabase/verify_phase5_security.sql` (Storage, upload, and IDOR check)
* `supabase/verify_phase6_security.sql` (Sharing and revocation check)
* `supabase/verify_phase7_security.sql` (Metadata management and soft-delete lockdown check)
* `supabase/verify_phase8_security.sql` (Audit history, safe projection, and chain verification check)

---

## 3. Test & Verification Commands

```bash
# Run the complete automated security test suite (142 tests)
npm test

# Run ESLint across all source and test files
npm run lint

# Run the Next.js Turbopack production build
npm run build
```

---

## 4. Production Deployment Guide (Vercel)

When deploying TrustVault to Vercel:

1. **Import Git Repository**:
   - In the Vercel Dashboard, click **Add New Project** -> **Import Git Repository**.
   - Select `https://github.com/srujan66619/TrustVault.git`.
2. **Framework Preset**:
   - Select **Next.js** (detected automatically via `vercel.json`).
3. **Configure Environment Variables**:
   Add the following variables in the Vercel Project Settings (under **Environment Variables**):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<your-project>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `<your-anon-public-key>`
   - `SUPABASE_SERVICE_ROLE_KEY` = `<your-service-role-secret-key>` (Select **Production** and **Preview**; leave **Development** unselected if desired).
4. **Deploy**:
   - Click **Deploy**. Vercel executes `npm run build` using Turbopack and TypeScript verification.
5. **Post-Deployment Verification**:
   - Verify security headers on the deployed URL using `curl -I https://<your-deployment>.vercel.app`.
   - Confirm presence of `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security`.
   - Perform a smoke test: log in, upload a test PDF, grant access, and verify the cryptographic chain on `/activity`.

---

## 5. Security Architecture & Invariants

### A. Central Choke-Point Authorization
* All access decisions route through `authorize(userId, documentId, action)`.
* Deny-by-default: unresolved states return `allowed: false`.
* Fresh database lookups: user status and role are read directly from PostgreSQL on every request; claims are never cached in JWTs.
* Uniform `404 Not Found` response for nonexistent, soft-deleted, or unauthorized document requests to prevent IDOR existence enumeration.

### B. Security Headers & WebGL CSP
Configured in `next.config.ts`:
* **Content-Security-Policy**: Restricted to `'self'`, `https://*.supabase.co`, and `wss://*.supabase.co`. Frame ancestors are blocked (`'none'`). WebGL textures and workers operate under strict `'self' data: blob:` allowances with zero broad `*` wildcards.
* **X-Content-Type-Options**: `nosniff` prevents MIME-confusion sniffing.
* **Referrer-Policy**: `strict-origin-when-cross-origin`.
* **X-Frame-Options**: `DENY` prevents clickjacking.
* **Strict-Transport-Security**: `max-age=63072000; includeSubDomains; preload` enforces HTTPS in production.

### C. CSRF & Request-Origin Protection
* State-changing endpoints (`POST`, `PATCH`, `DELETE`) enforce same-origin validation via `validateSameOrigin()`.
* Requests with `Sec-Fetch-Site: cross-site` or mismatched `Origin` / `Referer` headers are rejected with `HTTP 403 Forbidden`.

### D. Concurrency-Safe Rate Limiting
* Keyed in-memory token buckets restrict brute-force attacks across login, upload, permission mutations, audit verification, and repeated denied probes.
* Exceeded requests receive `HTTP 429 Too Many Requests` with `Retry-After` headers and generic error bodies that do not identify users.

### E. Private Storage & Direct Streaming
* Physical storage keys are randomized UUIDs completely detached from user filenames.
* Zero client storage policies: browser roles cannot upload, download, list, or delete objects directly in Supabase Storage.
* Download routes stream bytes directly through server handlers; long-lived pre-signed URLs are architecturally prohibited.

### F. Append-Only Cryptographic Audit Log
* Continuous SHA-256 hash chaining (`prev_hash`, `row_hash`) with database triggers raising exceptions on `UPDATE`, `DELETE`, or `TRUNCATE`.
* Single-transaction advisory locks (`pg_advisory_xact_lock`) guarantee monotonic sequencing without divergent branches.

---

## 6. Role & Permission Matrix

| Role / Grant | Document Upload | Download Owned | Download Shared | Edit Metadata | Soft Delete | Grant / Revoke | View Own History | View Global Audit & Verify |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **OWNER** | ✅ | ✅ | N/A | ✅ (Owned) | ✅ (Owned) | ✅ (Owned) | ✅ (Owned) | ❌ |
| **VIEWER** | ❌ | N/A | N/A | ❌ | ❌ | ❌ | ❌ | ❌ |
| **READ Grantee** | ❌ | N/A | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **EDIT Grantee** | ❌ | N/A | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **ADMIN** | ✅ | ✅ | N/A | ✅ (Owned) | ✅ (Owned) | ✅ (Owned) | ✅ (Owned) | ✅ |

*Note: The `ADMIN` role is subject to zero-trust scoping: administrators cannot view or download private user documents without an explicit grant or ownership.*

---

## 7. What Is Explicitly Not Built
To prevent false security assumptions, the following features are **intentionally not built** and are disclosed in documentation and UI:
* ❌ **Bulk Audit Export**: No bulk data dumps or automated exfiltration endpoints.
* ❌ **Permanent Cryptographic Purge**: Hard deletion or cryptographic shredding of historical audit records is not built; historical records are retained for tamper evidence.
* ❌ **Public Sharing Links**: Unauthenticated, tokenized, or password-protected public download links are prohibited.
* ❌ **User Directory Browsing**: No searchable user lists, email auto-completion, or directory browsing exists.
* ❌ **AI Features / Automated Summarization**: No LLM parsing, third-party AI APIs, or generative summarization.
* ❌ **Hardware WORM Storage**: The audit chain provides software cryptographic tamper-evidence against application-level attacks and standard database roles; it does not claim hardware-grade write-once media.

---

## 8. Known Limitations & Accepted Risks
1. **Per-Instance In-Memory Rate Limiting**: The in-memory rate limiting implementation operates per container/serverless instance. In multi-instance serverless deployments, rate-limit counters are not shared across instances unless backed by an external distributed store (e.g. Redis).
2. **PostgreSQL Superuser Ownership**: Cloud database superusers (`postgres` or cloud host administrators) retain raw disk access and can alter tables or disable triggers. In-database cryptographic chains defend against application compromises and standard roles, not root database host ownership.
3. **Active Network Stream Revocation**: When an owner revokes access, subsequent requests are rejected on the first millisecond. However, bytes already written to an active TCP socket during an in-flight download stream cannot be recalled by the server.
4. **CSP `'unsafe-inline'` Allowance**: Next.js App Router client hydration and React Flight bootstrap scripts currently require `'unsafe-inline'` for script and style tags unless nonces are generated per request via an Edge middleware proxy.
