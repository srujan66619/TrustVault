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

## What Is Explicitly Not Built Yet (Phase 3 Status)
To maintain total transparency and avoid false security assumptions, the following features are **intentionally not built** in this phase:
* ❌ **Document Upload / Download Routes**: Streaming route handlers and storage bucket configuration (Phase 4/5).
* ❌ **Document CRUD / Sharing UI**: Document management tables, grant/revoke modals, and activity viewers.
* ❌ **Cryptographic Audit Hash Chain Engine**: Node.js/Postgres SHA-256 rolling chain computation (Phase 4).
* ❌ **Private Storage Access**: Supabase Storage bucket policies and pre-signed streaming URL generation.
