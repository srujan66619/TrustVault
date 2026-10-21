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
  - Kept navigation items disabled with "Pending" badges to prevent misleading users or judges.

* **Real Git Commit Hash / Link**:
  *Pending Phase 1 commit.*

