# TrustVault

> Secure document sharing with verified access, immediate permission revocation, and tamper-evident activity records.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%7C%20Postgres%20%7C%20Storage-3ECF8E?logo=supabase)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Live app:** [TrustVault on Vercel](https://trust-vault-seven-liard.vercel.app/)
**Repository:** [github.com/srujan66619/TrustVault](https://github.com/srujan66619/TrustVault)

## Why TrustVault?

Sharing a sensitive document should not mean permanently giving up control over it.

TrustVault is built around a simple rule: every sensitive action must be authorized on the server using fresh database state. Owners can share documents with specific users, revoke access immediately, and review security-relevant activity through a tamper-evident audit trail.

## Features

- Server-side authorization for every document action
- Private Supabase Storage bucket with server-mediated downloads
- Owner-controlled `READ` and `EDIT` permission grants
- Immediate permission revocation for future requests
- Anti-IDOR document lookup and uniform not-found responses
- Soft deletion for owner documents
- Metadata updates with authorization checks
- Append-only, hash-chained audit records
- Audit history and hash-chain verification for authorized users
- CSRF/origin validation for state-changing requests
- Rate limiting for sensitive routes
- Responsive Next.js interface with accessibility-aware motion controls

## Security Model

| Area | TrustVault approach |
|---|---|
| Authorization | A centralized server-side authorization layer decides access for each request. |
| User status | Current profile status and role are checked from the database, not cached permission claims. |
| Storage | Files use randomized object keys in a private bucket. Browsers do not directly list or download storage objects. |
| Sharing | Owners grant and revoke access per document. Revocation blocks future authorization checks immediately. |
| IDOR protection | Unauthorized, deleted, and missing documents use the same not-found-style response. |
| Audit trail | Important actions are recorded in an append-only SHA-256 hash chain. |
| Browser protection | Security headers, same-origin validation, and generic error responses reduce common web attack paths. |

## Architecture

```text
Browser
  │
  ├── Next.js UI
  │
  └── Server route handlers
          │
          ├── Authentication session check
          ├── Central authorization decision
          ├── Supabase Postgres procedures + RLS
          ├── Private Supabase Storage
          └── Tamper-evident audit log
```

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase Postgres with Row Level Security
- Supabase private Storage
- Vitest
- Vercel

## Local Setup

### Prerequisites

- Node.js 20 or later
- npm
- A Supabase project with Auth, Postgres, and Storage enabled

### Install

```bash
git clone https://github.com/srujan66619/TrustVault.git
cd TrustVault
npm ci
```

### Configure environment variables

```bash
cp .env.example .env.local
```

Add your Supabase project values to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it with `NEXT_PUBLIC_`, commit it to Git, or expose it in the browser.

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database Setup

Apply the SQL files in `supabase/migrations/` in filename order to a fresh Supabase project.

The repository also contains verification scripts in `supabase/` for checking schema rules, private storage behavior, sharing and revocation, document operations, and audit integrity.

## Verification

```bash
npm test
npm run lint
npm run build
```

The automated suite includes authorization, permissions, document, audit, and security-hardening tests. Security tests are intended to fail if key access checks are removed.

## Deployment

TrustVault is deployed with Vercel.

Before deploying, configure these environment variables in Vercel Project Settings:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

After deployment, verify:

1. Email confirmation and sign-in work.
2. A permitted user can access only their allowed documents.
3. A revoked user cannot make a new document request successfully.
4. Upload, permission changes, and audit history work.
5. No service-role key appears in client code or browser network responses.

## Known Limitations

TrustVault documents current limitations openly:

- Rate limiting is in-memory, so counters are not shared across multiple serverless instances.
- Access revocation blocks future checks; it cannot recall bytes already sent during an active download.
- The audit chain detects application-level record tampering, but it does not protect against a database superuser or infrastructure operator.
- There are no public sharing links, bulk audit exports, user-directory browsing, or AI document analysis features.

## Documentation

- [Threat model](THREATS.md)
- [AI-assisted development record](PROMPTS.md)
- [Security and API documentation](API.md)
- [Demo guide](DEMO.md)

## License

This project is released under the MIT License. See [LICENSE](LICENSE).
