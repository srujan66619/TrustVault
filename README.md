# TrustVault

TrustVault is a secure document-sharing platform engineered with a security-first philosophy: **security is the product; CRUD is secondary.**

## Tech Stack
* **Framework**: Next.js 16+ (App Router, Server Components)
* **Language**: TypeScript
* **Styling**: Tailwind CSS
* **Database & Auth**: Supabase (Auth, Postgres, Private Storage)
* **Testing**: Vitest / Automated Security Test Suites

---

## Local Setup

### 1. Prerequisites
* Node.js `>= 20.x` (Tested on Node `v24.17.0`)
* npm `>= 10.x`
* Supabase account / project (or local Supabase environment)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/srujan66619/TrustVault.git
cd TrustVault
npm install
```

### 3. Environment Variables
Copy the template to `.env.local`:
```bash
cp .env.example .env.local
```

Required variables in `.env.local`:
* `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL (safe for browser exposure).
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous public key (subject to Postgres RLS).

> [!CAUTION]
> **Secret Key Policy**:
> * `SUPABASE_SERVICE_ROLE_KEY` is **server-only** and never exposed to the client bundle.
> * Real `.env.local` files are ignored by `.gitignore` to prevent secret leakage. Never commit environment secrets.

### 4. Database Setup & Migrations
The initial schema migration is located at:
`supabase/migrations/20261021000000_secure_schema_baseline.sql`

To apply this migration to your Supabase project:
* **Option A (Supabase Dashboard)**: Open your Supabase Dashboard -> **SQL Editor**, paste the contents of `supabase/migrations/20261021000000_secure_schema_baseline.sql`, and click **Run**.
* **Option B (Supabase CLI)**: If linked to your project:
  ```bash
  supabase db push
  ```
To verify constraints and triggers, execute the automated SQL verification suite:
* Run `supabase/verify_schema.sql` in the Supabase SQL Editor.

### 5. Running Locally
Run the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to inspect the application.

### 6. Running Lint & Build
```bash
npm run lint
npm run build
```

---

## Database Schema & Security Architecture (Phase 2 Baseline)

### 1. `profiles`
* **Fields**: `id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `role text NOT NULL CHECK (role IN ('ADMIN', 'OWNER', 'VIEWER'))`, `status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED'))`, timestamps.
* **Escalation Protection**: Database trigger `trg_prevent_profile_privilege_escalation` blocks any client (role `authenticated` or `anon`) from modifying `role` or `status`.
* **Safe Profile Provisioning**: `handle_new_user()` trigger on `auth.users` automatically initializes profiles with role `VIEWER` and status `ACTIVE`, strictly ignoring any client-supplied user metadata.

### 2. `documents`
* **Fields**: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `owner_id uuid NOT NULL REFERENCES profiles(id)`, `display_name text NOT NULL`, `category text NOT NULL`, `content_type text NOT NULL`, `size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 104857600)`, `storage_object_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE`, `deleted_at timestamptz NULL`, timestamps.
* **Storage Isolation**: Storage object keys are randomized server-generated UUIDs; client file paths are never accepted or stored.
* **Soft-Delete Guard**: RLS policies explicitly enforce `deleted_at IS NULL` to prevent soft-deleted documents from leaking.
* **Owner Role Enforcement**: Database trigger `trg_check_document_owner_role` prevents any document from being created or assigned to a user whose profile role is not `OWNER` or `ADMIN` (with status `ACTIVE`). A `VIEWER` cannot own documents.
* **Zero Direct Client Mutations**: Browser clients have **no** `INSERT`, `UPDATE`, or `DELETE` RLS policies. Document uploads, metadata changes, and soft-deletions must be executed through server-side Route Handlers where `authorize()` and audit logging occur.


### 3. `document_permissions`
* **Fields**: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `document_id uuid REFERENCES documents(id) ON DELETE CASCADE`, `grantee_id uuid REFERENCES profiles(id) ON DELETE CASCADE`, `permission text NOT NULL CHECK (permission IN ('READ', 'EDIT'))`, timestamps.
* **Constraints**: Unique constraint `uq_document_grantee` prevents duplicate grants.
* **Owner-as-Grantee Prevention**: Database trigger `trg_check_grantee_not_owner` raises an exception if a document's owner is inserted as an external grantee.
* **Zero Direct Client Mutations**: Browser clients have **no** `INSERT`, `UPDATE`, or `DELETE` RLS policies. All permission grants and revocations must be executed by server-side authorization routines to guarantee centralized authorization and mandatory audit logging.

### 4. `audit_logs` (Append-Only)
* **Fields**: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `actor_id uuid REFERENCES profiles(id)`, `document_id uuid REFERENCES documents(id)`, `action text NOT NULL`, `result text NOT NULL CHECK (result IN ('SUCCESS', 'ACCESS_DENIED', 'FAILURE'))`, `timestamp timestamptz DEFAULT now()`, `ip_address text`, `user_agent text`, `metadata jsonb`, `prev_hash text`, `row_hash text`.
* **Immutability Enforcement**: 
  * Row-level trigger `trg_prevent_audit_log_mutation` raises an exception on any `UPDATE` or `DELETE` attempt.
  * Statement-level trigger `trg_prevent_audit_log_truncate` blocks any `TRUNCATE` attempt.
* **Write Access**: Direct client `INSERT` is blocked via RLS; records are emitted solely through server-side authorization routines.


### Defense in Depth Reminder
Postgres RLS provides strict database-level defense in depth. However, database policies alone are **not** the sole authorization check: all document-related operations must still pass through the centralized server-side `authorize(userId, documentId, action)` choke-point.

---

## Authentication & Authorization Core (Phase 3 Baseline)

### 1. Secure Server-Side Authentication
* **Server-Only Guards**: `src/lib/auth/session.ts` and `src/lib/supabase/admin.ts` import `'server-only'`, guaranteeing at compile time that session inspection and administrative logic cannot be bundled into client-side JavaScript.
* **Cryptographic Token Verification**: Session validation invokes `supabase.auth.getUser()`, which validates the user's JWT with the remote Supabase Auth server on every protected request. Local unvalidated session reads (`getSession()`) are strictly forbidden.
* **Live Database Profile Validation**: Client-submitted inputs, URL query parameters, local storage, and JWT `user_metadata` are **never trusted** for security decisions. `getCurrentUser()` and `requireAuth()` read the user's live `role` and `status` directly from `public.profiles`.
* **Instant Session Revocation**: When a user's `profiles.status` is updated to `DISABLED`, access is immediately revoked at the server level regardless of whether an unexpired JWT exists.

### 2. Centralized Authorization Core (`src/lib/authorization/authorize.ts`)
* **Single Choke-Point**: `authorize(userId, documentId, action)` is the **sole decision point** for all document access.
* **Deny-by-Default**: Any unhandled branch, missing grant, disabled status, or malformed parameter evaluates to `allowed: false`.
* **Zero-Trust Admin Model**: `ADMIN` access is explicitly scoped to compliance auditing (`VIEW_AUDIT`). Administrators are **not** granted universal bypass to private user documents (`READ`, `DOWNLOAD`, `EDIT`, `DELETE`), preventing administrative surveillance.
* **Anti-Enumeration / IDOR Protection**: Unauthorized callers and queries for soft-deleted or nonexistent documents receive an identical `NOT_FOUND_OR_DENIED` response, preventing attackers from mapping document UUIDs.

### 3. Centralized Authorization Decision Matrix

| Role / Actor | Account Status | Document Status | `READ` | `DOWNLOAD` | `EDIT` | `DELETE` | `GRANT` | `REVOKE` | `VIEW_AUDIT` | Denial Reason |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Owner** | `ACTIVE` | Active | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | — |
| **EDIT Grantee** | `ACTIVE` | Active | **ALLOW** | **ALLOW** | **ALLOW** | **DENY** | **DENY** | **DENY** | **DENY** | `UNAUTHORIZED_ACTION` |
| **READ Grantee** | `ACTIVE` | Active | **ALLOW** | **ALLOW** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | `UNAUTHORIZED_ACTION` |
| **Unrelated User** | `ACTIVE` | Active | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | `NOT_FOUND_OR_DENIED` |
| **Admin (Non-Owner)** | `ACTIVE` | Active | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **ALLOW** | `NOT_FOUND_OR_DENIED` |
| **Any User** | `DISABLED` | Any | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | `ACCOUNT_DISABLED` |
| **Any User** | `ACTIVE` | Soft-Deleted | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | `NOT_FOUND_OR_DENIED` |
| **Any User** | `ACTIVE` | Nonexistent | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | `NOT_FOUND_OR_DENIED` |

---

## Tamper-Evident Audit-Log Infrastructure (Phase 4 Baseline)

### 1. Cryptographic SHA-256 Hash Chain
Every event recorded in `public.audit_logs` forms an unbroken, mathematically verifiable hash chain:
* **Monotonic Sequence (`sequence_number`)**: Unique, strictly ascending sequence starting at 1 with zero gaps.
* **Prior Hash Anchor (`prev_hash`)**: Stores the `row_hash` of the immediately preceding record. For the genesis record (sequence 1), `prev_hash` is anchored to 64 zeros (`0000000000000000000000000000000000000000000000000000000000000000`).
* **Current Row Hash (`row_hash`)**: Non-null SHA-256 digest computed from a deterministic canonical payload.

### 2. Deterministic Canonical Payload Format
To eliminate ambiguity, payload fields are formatted into a deterministic newline-separated specification:
```
seq:<sequence_number>
id:<id>
actor:<actor_id_or_empty>
doc:<document_id_or_empty>
action:<action>
result:<result>
ts:<iso8601_utc_timestamp_microseconds>
prev:<prev_hash>
meta:<canonical_jsonb_text>
```
Any modification to actor, document, action, result, timestamp, metadata, or prior hash alters the computed hash and breaks the chain.

### 3. Concurrency Serialization & Anti-Forking
Concurrent writes cannot fork the hash chain or introduce sequence gaps:
* `append_audit_log` acquires a transaction-scoped advisory lock (`pg_advisory_xact_lock(8273619283746152431::bigint)`).
* All concurrent append transactions serialize cleanly, reading the committed chain head before inserting the next entry.
* The lock releases automatically upon transaction `COMMIT` or `ROLLBACK`.

### 4. Privilege Isolation & Role Model
* **Client Write Lockdown**: Table privileges (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`) on `public.audit_logs` are revoked from `anon` and `authenticated` browser roles.
* **RPC Execution Lockdown**: `append_audit_log` execution is revoked from `PUBLIC`, `anon`, and `authenticated`; granted exclusively to server `service_role`.
* **Database Triggers**: Row-level trigger `trg_prevent_audit_log_mutation` and statement-level trigger `trg_prevent_audit_log_truncate` block any modification even if attempted by privileged roles.
* **Foreign Key Decoupling**: Foreign keys with `ON DELETE SET NULL` were dropped to guarantee that document deletions or user account purges never mutate historical audit rows, and non-existent IDs probed during IDOR attacks can be safely logged without constraint errors.

### 5. Server-Side Fail-Closed Helper (`src/lib/audit/audit.ts`)
* `logAuditEvent(input)` executes `append_audit_log` under `service_role`.
* **Fail-Closed Guarantee**: Throws `AuditLoggingError` if logging fails. Calling sensitive routes must abort execution if the audit record cannot be committed.
* `verifyAuditChain(fromSequence, limit)` recomputes every payload hash and verifies chain continuity, sequence monotonicity, and hash links.

---

## Secure Document Access & File Handling (Phase 5 Baseline)

### 1. Private Storage Architecture
TrustVault uses a dedicated private Supabase Storage bucket (`documents`) isolated from browser clients:
* **Zero Browser Client Storage Access**: RLS on `storage.objects` denies all operations (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) from `anon` and `authenticated` browser roles. Browser clients have zero direct Storage API access.
* **No Signed Download URLs**: TrustVault strictly prohibits time-limited pre-signed download URLs. Pre-signed URLs leak permanent authorization into cached URLs and evade real-time database permission revocation. All bytes stream directly through Next.js server route handlers.
* **Random UUID Storage Object Keys**: Physical storage keys are generated server-side using cryptographic UUIDs (`crypto.randomUUID()`). Physical storage paths are never derived from filenames, user IDs, or client-supplied strings, preventing path traversal and object enumeration.

### 2. Multi-Layer File Validation
All uploaded files are subjected to strict server-side validation before storage:
* **Extension Allow-List**: Only `.pdf`, `.png`, `.jpg`, `.jpeg`, and `.txt` are permitted.
* **Magic-Byte Signature Verification**: Inspects raw binary headers (e.g. `%PDF-` for PDF, `\x89PNG\r\n\x1a\n` for PNG, `\xFF\xD8\xFF` for JPEG, UTF-8 clean text with zero null bytes for TXT). Browser-supplied MIME headers are untrusted.
* **Strict Type Rejection**: SVG (preventing stored XSS), HTML, executables, scripts, shell binaries, and archives are strictly denied.
* **Size Limits**: Enforces a conservative 15MB limit (`15,728,640` bytes) for safe in-memory streaming and memory exhaustion protection.
* **Display Name Sanitization**: Strips path separators (`/`, `\`), traversal sequences (`..`), null bytes (`\0`), HTML brackets, and control characters.
* **Zod Input Validation**: Non-file metadata (title, category) is validated via Zod schemas. Request bodies are never spread directly into database queries.

### 3. Server Endpoints & In-Database Scoping
All document interactions occur through server-side route handlers enforcing live profile status and centralized `authorize(userId, documentId, action)`:
* **`POST /api/documents`**: Validates file and metadata, generates random UUID storage key, uploads to private bucket, creates database record, and writes an atomic tamper-evident audit log. If database or audit write fails, the uploaded storage object is deleted (fail-closed atomic rollback).
* **`GET /api/documents`**: Lists and searches accessible documents. Filters for owner and grantee permissions directly inside PostgreSQL (`public.list_accessible_documents`), ensuring unowned/ungranted records are never fetched. Runs `authorize()` on each record before serialization as defense in depth.
* **`GET /api/documents/[id]`**: Retrieves document metadata. Returns a uniform 404 for forbidden, soft-deleted, invalid, or nonexistent IDs to prevent document existence enumeration. Internal `storage_object_key` is never exposed.
* **`GET /api/documents/[id]/download`**: Downloads document bytes. Re-evaluates authorization immediately before beginning download streaming. Commits the allowed-download audit event before streaming bytes. Sets `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and server-allowlisted `Content-Type`.

---

## What Is Explicitly Not Built Yet (Phase 5 Status)
To maintain total transparency and avoid false security assumptions, the following features are **intentionally not built** in this phase:
* ❌ **Sharing & Permission Management Routes**: Explicit grant (`POST /api/documents/[id]/permissions`) and revoke endpoints (Phase 6).
* ❌ **Document CRUD & Sharing UI**: File upload forms, document list tables, and permission grant/revoke dialogs.
* ❌ **Audit History UI**: Frontend screens for viewing audit trails or triggering verification scans.
* ❌ **Admin Dashboard**: Multi-tenant administrative views or system status dashboards.
