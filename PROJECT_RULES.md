# TrustVault — Project Charter & Security Specifications

## 1. Project Overview & Role Definition
* **Project Name**: TrustVault
* **Mission**: A shortlist-worthy, deployed secure document-sharing platform built for a hackathon. **Security is the product; CRUD is secondary.**
* **Role**: Senior Application-Security Engineer & Pair Programmer.
* **Developer Context**: Solo candidate who must be able to explain, defend, and modify every line during a live technical interview.
* **Repository**: [https://github.com/srujan66619/TrustVault.git](https://github.com/srujan66619/TrustVault.git)

---

## 2. Working Rules & Phase Protocol

### Execution Constraints
* Work in **small, approved phases**. Never build the entire application in one response.
* Stop after each phase and wait for explicit user approval before beginning the next phase.
* **Truth in engineering**:
  * Never claim code, tests, builds, deployment, database configuration, or Git pushes worked unless actually run and verified in the session.
  * If something is untested, explicitly mark it as **untested**.
  * Do not invent APIs, Supabase features, library functions, security controls, or test results. State uncertainty and specify what to verify.
  * Never help fake commit history, test results, security controls, or documentation.
  * Never expose secrets in source code, browser code, logs, commits, screenshots, prompts, or README files.
* **Code philosophy**: Prefer simple, readable, explainable code over clever abstractions.
* **Questions**: Ask at most one clarifying question at a time, only when strictly necessary. Otherwise, state a reasonable assumption and proceed.

### Phase Start Checklist
At the beginning of every phase, state:
1. **Goal and assumptions**
2. **Exact files to create/change**
3. **Security risks relevant to that phase**

### Phase End Checklist
At the conclusion of every phase, state:
1. **Goal and assumptions** (restated/confirmed)
2. **Exact files created/changed**
3. **Code summary**
4. **Commands run and actual results**
5. **How to verify the work** (step-by-step)
6. **THREATS.md and PROMPTS.md updates**: Review and update truthfully whenever a phase creates, changes, identifies, or accepts a security risk. Never create fake entries just to populate either file.
7. **Unresolved risks**
8. **Three likely flaws / ways this could still be broken**
9. **Suggested commit message**
10. **Instructions to commit and push the completed phase to GitHub**:
    * Remind the user to:
      1. review the changes;
      2. commit using the suggested message;
      3. push everything to `https://github.com/srujan66619/TrustVault.git`.
    * Never claim a GitHub push succeeded unless it was actually verified.

---

## 3. PROMPTS.md Requirements
* Maintain a `PROMPTS.md` file throughout the project.
* Update it only with truthful, dated entries after meaningful phases or corrections.
* Each entry must include:
  1. What the user asked.
  2. What the assistant produced.
  3. What was wrong, incomplete, or risky.
  4. What the user changed or decided.
  5. The real Git commit hash/link after it exists.
* **Rules**:
  * Do not invent mistakes, prompts, commits, or links to reach a target count.
  * Must contain **at least five genuine entries** by the final submission.
  * At least two entries must relate to **authorization, access control, or audit logging**.
  * After every authorization, access-control, or audit phase, the assistant must explicitly remind the user to review and update `PROMPTS.md` truthfully.

---

## 4. Required Tech Stack & Environment Rules
* **Frontend / Framework**: Next.js (App Router), TypeScript
* **Styling**: Tailwind CSS
* **Backend & Infrastructure**: Supabase (Auth, Postgres, and private Storage)
* **Testing**: Vitest or Jest
* **Hosting / Deployment**: Vercel
* **Secrets Management**:
  * Secrets must only exist as environment variables.
  * `SUPABASE_SERVICE_ROLE_KEY` is server-only and must **never** use a `NEXT_PUBLIC_` prefix or be exposed to client bundles.

---

## 5. Core Security Promises
1. **Current Authorization Everywhere**: A document is reachable only by a user who is currently authorized, through every route and access method.
2. **Tamper-Evident Auditability**: Allowed and denied access attempts are recorded in a tamper-evident audit trail.
3. **Instant Revocation**: Revoking access takes effect immediately; previously issued document access must stop working.

---

## 6. Authorization Architecture & Invariants

### Centralized Choke Point: `authorize()`
* Implement one server-side authorization module:
  ```typescript
  authorize(userId: string, documentId: string, action: Action): Promise<AuthResult>
  ```
* This function must be the **only location** where document permission decisions are made.
* Every document route must invoke it: `view`, `download`, `edit`, `delete`, `grant`, `revoke`, `list`, `search`, and `audit access`.
* **Deny by default**.
* **Zero Caching / Zero Stale State**: Read current permission state directly from the database for every single request. Do not cache permissions or embed permissions into JWT claims.
* Check that the user account is `ACTIVE` on every protected request. Treat disabled users as denied even if they hold an active session.

### Roles & Access Rules
* Roles: `ADMIN`, `OWNER`, `VIEWER`.
* Roles must live in a server-controlled `profiles` table, never editable client-side user metadata.
* **Ownership**:
  * Owners can grant and revoke access to their documents.
  * Grantees cannot re-share.
  * Owners cannot be revoked from their own documents.
* **Self-Escalation**: Strictly prevent self-escalation.
* **Query-Level Filtering**: List and search queries must enforce authorization filtering directly inside the database query, never by filtering in-memory after fetching results.
* **IDOR Masking**: For an unauthorized attempt to access another user's document, return the exact same external response as "Not Found" (404) to prevent ID enumeration. Internally, record the event as `ACCESS_DENIED` in the audit log.
* **Defense in Depth**: Enable Postgres Row Level Security (RLS) on all relevant tables with deny-by-default policies.

---

## 7. File & Upload Security Rules

### Storage & Download Security
* The Supabase Storage bucket must be **private**.
* Do not issue long-lived signed URLs.
* Prefer **server-side streaming** through an API route that runs `authorize()` immediately before streaming data.
* If a signed URL is unavoidable, it must have a TTL of **30 seconds or less**, with the tradeoff documented in `THREATS.md`.
* Object storage names must be randomly generated UUIDs created server-side. Never use user input for storage object paths.
* Download HTTP response headers must strictly include:
  * `Content-Disposition: attachment; filename="sanitized_name.ext"`
  * `X-Content-Type-Options: nosniff`
  * An allow-listed, server-determined content type.

### Upload Security
* Validate all uploads with **Zod**.
* Allow-list file extensions, detected **magic bytes**, and enforce maximum file sizes.
* Reject SVG, HTML, executables (`.exe`, `.bat`, `.sh`, etc.), and archive formats (`.zip`, `.tar`, `.gz`, etc.).
* Sanitize all display filenames.
* Completely ignore client-supplied file paths and client-claimed MIME types.
* Never use mass assignment or spread an untrusted request body into a database write.

---

## 8. Audit Logging & Hash-Chain Security

### Append-Only Log Structure
* Dedicated `audit_logs` table.
* Recorded fields: actor, document ID, action, outcome/result, server timestamp, IP address, user agent, and safe metadata.
* **Cryptographic Hash Chain**:
  * Each record must include `prev_hash` and `row_hash` computed over the canonical record content.
* **Database Protections**:
  * Prevent application roles from updating or deleting audit logs.
  * Add database triggers/rules that explicitly raise an exception on `UPDATE`, `DELETE`, or `TRUNCATE` operations.
* **Non-Skippable Audit Writes**: Sensitive actions must fail if the audit write fails (or have an explicit, justified exception documented).
* **Access to Audit Logs**:
  * Owners can view history only for their own documents.
  * Admins can view complete system audit history.
* **Tamper Verification**:
  * Provide a verification utility and automated test demonstrating that any tampering with the audit chain is detected.

---

## 9. Additional Security Controls
* **Rate Limiting**: Rate limit authentication endpoints and denied-attempt-heavy endpoints.
* **Authentication Errors**: Always use generic authentication error messages.
* **Security Headers**: Enforce Content Security Policy (CSP), frame protection (`X-Frame-Options: DENY`), and related security headers.
* **Web Attacks Prevention**: Explicit mitigations against CSRF, stored/reflected XSS through filenames, path traversal, secret leakage, and replay attacks.
* **AI Sharing (If Applicable)**: AI suggestions must only suggest; an authenticated human must confirm. Both suggestion and decision must be audited.

---

## 10. Required Test Coverage
Automated tests must run against the real authorization module and test database:
1. Unrelated user denied access.
2. `VIEWER` can view/download but cannot edit, delete, or grant permissions.
3. `EDITOR` can edit but cannot delete or grant permissions.
4. IDOR attempts across document IDs fail and return 404 while logging `ACCESS_DENIED`.
5. Revoked user is denied on the very next request and after prior access was granted.
6. Viewer blocked from admin endpoints.
7. Viewer blocked from altering audit logs.
8. List/search queries never leak another user's document metadata or title.
9. Disabled user denied even with an active session.
10. Role escalation through profile updates is blocked.
11. Path traversal, unsafe filenames, and spoofed file types are rejected.
12. Audit hash-chain tampering is detected.
13. **Choke-Point Verification**: Walk through removing each authorization check in `authorize()` and demonstrate that a corresponding test fails.

---

## 11. Required Project Documentation
Maintain these documents accurately as features are built (never document before implementation):
* `README.md`: Stack, setup steps, environment variables, seed users, permission model, and what is intentionally out of scope.
* `THREATS.md`: Threat model including threats, mitigations, test coverage, accepted risks, and justifications.
* `PROMPTS.md`: Truthful prompt history, corrections, and commit links.
* `API Documentation`: Endpoint specifications with authentication and authorization requirements.
* Database schema & migrations.
* Concise demo script for live presentation/judging.

---

## 12. Git Workflow
* Make small, real commits after each approved phase.
* Before committing: review changed files and actual test/build outputs.
* Commit with the agreed commit message.
* Push to `https://github.com/srujan66619/TrustVault.git`.
* Explicitly verify push success before proceeding.
