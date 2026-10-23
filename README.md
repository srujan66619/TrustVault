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

## What Is Explicitly Not Built Yet (Phase 2 Status)
* ❌ **User Authentication Flow UI**: Login, signup, password reset forms.
* ❌ **Central Server Authorization**: `authorize(userId, docId, action)` Next.js helper module (Phase 3).
* ❌ **Document Upload / Download Routes**: Streaming route handlers and storage bucket configuration.
* ❌ **Cryptographic Audit Hash Chain Engine**: Node.js/Postgres SHA-256 rolling chain computation (Phase 4).
* ❌ **UI Screens**: Document management tables, grant/revoke modals, and activity viewers.
