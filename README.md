# TrustVault

TrustVault is a secure document-sharing platform engineered with a security-first philosophy: **security is the product; CRUD is secondary.**

## Tech Stack
* **Framework**: Next.js 16+ (App Router, Server Components)
* **Language**: TypeScript
* **Styling**: Tailwind CSS
* **Database & Auth (Future Phases)**: Supabase (Auth, Postgres, Private Storage)
* **Testing**: Vitest / Unit & Integration Suites (Targeted for authorization & file pipelines)

---

## Local Setup

### 1. Prerequisites
* Node.js `>= 20.x` (Tested on Node `v24.17.0`)
* npm `>= 10.x`

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
> * `SUPABASE_SERVICE_ROLE_KEY` is **strictly unused, unreferenced, and omitted** in Phase 1.
> * Real `.env.local` files are ignored by `.gitignore` to prevent secret leakage. Never commit environment secrets.

### 4. Running Locally
Run the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to inspect the baseline application.

### 5. Running Lint & Build
```bash
npm run lint
npm run build
```

---

## What Is Explicitly Not Built Yet (Phase 1 Status)
To maintain total transparency and avoid false security assumptions, the following features are **intentionally not built** in this phase:
* ❌ **User Authentication**: Login, signup, password resets, session refreshment.
* ❌ **Central Authorization Choke-point**: `authorize(userId, docId, action)` logic.
* ❌ **User Roles & Profiles**: `ADMIN`, `OWNER`, and `VIEWER` database roles.
* ❌ **Document Upload / Download**: Storage bucket configuration, streaming routes, and magic-byte validation.
* ❌ **Database Schema & RLS**: Postgres tables and row-level security policies.
* ❌ **Audit Trail**: Tamper-evident cryptographic hash chains and append-only database triggers.
* ❌ **Service Role Key Usage**: No server-side administrative bypasses are configured.
