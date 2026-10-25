# TrustVault — REST API Reference (`API.md`)

This document defines the complete HTTP interface for TrustVault. All endpoints require an active, authenticated session cookie mediated by Supabase Auth, unless explicitly stated otherwise. Direct browser access to underlying PostgreSQL tables and Supabase Storage is completely barred.

---

## 1. Global Security & Transport Conventions

### A. Authentication & Session Verification
- Requests authenticate via HTTP-only session cookies (`sb-*-auth-token`).
- Centralized authorization (`authorize(userId, documentId, action)`) resolves live database profile role and status on **every request**.
- If `profiles.status === 'DISABLED'`, all requests immediately abort with `HTTP 403 Forbidden` (`{"error": "Account is suspended or disabled"}`).
- Unauthenticated requests abort with `HTTP 401 Unauthorized`.

### B. Anti-Enumeration & IDOR Defense
- Single-document queries, metadata edits, downloads, deletions, permission grants, revocations, and document activity return a uniform generic error for nonexistent, forbidden, or soft-deleted records:
  ```json
  { "error": "Document not found or access denied" }
  ```
  **HTTP Status**: `404 Not Found` (anti-enumeration guarantees no difference between nonexistent UUIDs and unauthorized IDs).

### C. CSRF & Request-Origin Enforcement
- State-changing methods (`POST`, `PATCH`, `DELETE`) enforce same-origin verification via `Sec-Fetch-Site` and `Origin` / `Referer` headers.
- Cross-origin requests return `HTTP 403 Forbidden` (`{"error": "Invalid request origin or cross-site request blocked"}`).

### D. Concurrency-Safe Rate Limiting
- Keyed in-memory token buckets enforce traffic bounds without public user identification:
  - **Login**: 5 attempts per 15 minutes (`HTTP 429 Too Many Requests`).
  - **Upload**: 20 uploads per minute (`HTTP 429`).
  - **Permissions (Grant/Revoke)**: 20 mutations per minute (`HTTP 429`).
  - **Audit Verification**: 5 verifications per minute (`HTTP 429`).
  - **Repeated Denied Probes**: 10 denied attempts per 5 minutes (`HTTP 429`).
- Exceeded limits return:
  ```json
  { "error": "Too many requests. Please try again later." }
  ```
  along with a `Retry-After: <seconds>` HTTP header.

---

## 2. Document Endpoints

### `POST /api/documents`
* **Description**: Secure atomic document upload.
* **Authentication**: `OWNER` or `ADMIN` role with `status = 'ACTIVE'`.
* **Content-Type**: `multipart/form-data`.
* **Payload Fields**:
  - `file`: Raw binary file (required, max 15MB). Allowed extensions: `.pdf`, `.png`, `.jpg`, `.jpeg`, `.txt`. Magic bytes strictly validated.
  - `displayName` / `title`: Optional custom display name (max 255 chars, control characters stripped).
  - `category`: Optional category string (`general`, `financial`, `legal`, `personal`, `technical`).
* **Origin Protection**: Enforced.
* **Rate Limit**: 20 uploads / minute per user.
* **Audit Event**: `DOCUMENT_CREATE` (atomic single-transaction recording; failure aborts upload).
* **Responses**:
  - `201 Created`:
    ```json
    {
      "success": true,
      "document": {
        "id": "uuid",
        "displayName": "file.pdf",
        "category": "financial",
        "contentType": "application/pdf",
        "sizeBytes": 1024,
        "createdAt": "2026-10-25T12:00:00Z"
      }
    }
    ```
  - `400 Bad Request`: Invalid file type, magic byte mismatch, or oversized payload.
  - `403 Forbidden`: Cross-origin request or suspended account.
  - `429 Too Many Requests`: Rate limit exceeded.

---

### `GET /api/documents`
* **Description**: Lists accessible documents (owned by caller or explicitly shared with active grant).
* **Authentication**: `VIEWER`, `OWNER`, or `ADMIN` with `status = 'ACTIVE'`.
* **Query Parameters**:
  - `search`: Case-insensitive substring match against `display_name` (max 100 chars).
  - `category`: Category filter (`general`, `financial`, `legal`, `personal`, `technical`).
  - `ownerFilter`: Ownership filter (`mine`, `shared`).
  - `createdAfter` / `createdBefore`: ISO 8601 date range filters.
  - `limit`: Integer (1–100, default 50).
  - `offset`: Integer (>= 0, default 0).
* **Origin Protection**: Not applicable (safe GET).
* **Rate Limit**: Standard request rate.
* **Audit Event**: `READ` with structural query metadata (zero raw search terms logged).
* **Responses**:
  - `200 OK`:
    ```json
    {
      "documents": [
        {
          "id": "uuid",
          "displayName": "Statement.pdf",
          "category": "financial",
          "contentType": "application/pdf",
          "sizeBytes": 2048,
          "createdAt": "2026-10-25T12:00:00Z",
          "isOwner": true,
          "permission": null
        }
      ]
    }
    ```

---

### `GET /api/documents/[id]`
* **Description**: Retrieves sanitized metadata for a single accessible document.
* **Authentication**: Document Owner, active `READ` grantee, or active `EDIT` grantee.
* **Origin Protection**: Not applicable (safe GET).
* **Rate Limit**: Repeated denied access threshold (10 / 5 min).
* **Audit Event**: `READ` (logged on allowed and denied attempts).
* **Responses**:
  - `200 OK`: Returns document metadata object (excluding physical storage keys).
  - `404 Not Found`: Uniform anti-enumeration response for nonexistent, soft-deleted, or unshared documents.

---

### `PATCH /api/documents/[id]`
* **Description**: Updates safe document metadata (`displayName`, `category`).
* **Authentication**: Document Owner or active `EDIT` grantee. `READ` grantees are denied.
* **Content-Type**: `application/json`.
* **Payload Fields**:
  - `displayName`: String (1–255 chars, no HTML `<` `>` or control characters).
  - `category`: Allowlisted category string.
* **Origin Protection**: Enforced.
* **Audit Event**: `EDIT` (atomic single-transaction recording).
* **Responses**:
  - `200 OK`:
    ```json
    {
      "document": { ... },
      "auditSequenceNumber": 142
    }
    ```
  - `400 Bad Request`: Mass-assignment violation or invalid characters.
  - `404 Not Found`: Nonexistent, unowned, soft-deleted, or `READ`-grantee callers.

---

### `DELETE /api/documents/[id]`
* **Description**: Soft-deletes a document (`deleted_at = now()`).
* **Authentication**: Strictly Document Owner. `EDIT` grantees are denied.
* **Origin Protection**: Enforced.
* **Audit Event**: `DELETE` (atomic single-transaction recording).
* **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "deletedAt": "2026-10-25T12:00:00Z",
      "auditSequenceNumber": 143
    }
    ```
  - `404 Not Found`: Nonexistent, unowned, soft-deleted, or grantee callers.

---

### `GET /api/documents/[id]/download`
* **Description**: Streams document bytes directly through server response.
* **Authentication**: Document Owner, active `READ` grantee, or active `EDIT` grantee.
* **Security Headers**: `Content-Disposition: attachment; filename="..."`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.
* **Rate Limit**: Repeated denied access threshold (10 / 5 min).
* **Audit Event**: `DOWNLOAD` (logged on allowed and denied attempts). Re-checked immediately prior to initiating byte stream.
* **Responses**:
  - `200 OK`: Binary byte stream.
  - `404 Not Found`: Uniform denial for nonexistent, revoked, or unshared records.

---

## 3. Permission Sharing Endpoints

### `GET /api/documents/[id]/permissions`
* **Description**: Lists current active permission grants for a document.
* **Authentication**: Strictly Document Owner.
* **Audit Event**: `READ` with permission listing metadata.
* **Responses**:
  - `200 OK`:
    ```json
    {
      "permissions": [
        {
          "granteeId": "uuid",
          "granteeEmail": "user@example.com",
          "permission": "READ",
          "createdAt": "2026-10-25T12:00:00Z"
        }
      ]
    }
    ```
  - `404 Not Found`: Non-owner, soft-deleted, or nonexistent documents.

---

### `POST /api/documents/[id]/permissions`
* **Description**: Grants or updates `READ` or `EDIT` permissions to a target user by email.
* **Authentication**: Strictly Document Owner. Re-sharing by grantees is prohibited.
* **Content-Type**: `application/json`.
* **Payload Fields**:
  - `email`: Valid email address (normalized to lowercase).
  - `permission`: Strictly `'READ'` or `'EDIT'`.
* **Origin Protection**: Enforced.
* **Rate Limit**: 20 requests / minute per user.
* **Audit Event**: `GRANT` (atomic transaction recording with safe reason code).
* **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "message": "Permission grant processed. If an active account exists with that email, access was updated."
    }
    ```
  - `400 Bad Request`: Self-grant attempt or invalid permission value.
  - `404 Not Found`: Non-owner caller or invalid document UUID.

---

### `DELETE /api/documents/[id]/permissions/[granteeId]`
* **Description**: Immediately revokes a grantee's access.
* **Authentication**: Strictly Document Owner.
* **Origin Protection**: Enforced.
* **Rate Limit**: 20 requests / minute per user.
* **Audit Event**: `REVOKE` (atomic transaction recording).
* **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "message": "Permission revoked successfully."
    }
    ```
  - `400 Bad Request`: Attempt to revoke document owner.
  - `404 Not Found`: Non-owner caller or invalid UUIDs.

---

## 4. Activity & Audit Endpoints

### `GET /api/documents/[id]/activity`
* **Description**: Retrieves audit history entries for a single owned document.
* **Authentication**: Strictly Document Owner. Grantees (`READ`/`EDIT`) receive generic 404.
* **Query Parameters**:
  - `action`: Filter by action code (`DOCUMENT_CREATE`, `READ`, `DOWNLOAD`, `EDIT`, etc.).
  - `result`: Filter by status (`SUCCESS`, `ACCESS_DENIED`, `FAILURE`).
  - `limit`: Integer (1–100, default 50).
  - `offset`: Integer (>= 0, default 0).
* **Audit Event**: `AUDIT_VIEW` (fail-closed execution; bounded structural metadata).
* **Responses**:
  - `200 OK`:
    ```json
    {
      "activity": [
        {
          "sequenceNumber": 42,
          "actorId": "uuid",
          "documentId": "uuid",
          "action": "READ",
          "result": "SUCCESS",
          "timestamp": "2026-10-25T12:00:00Z",
          "metadata": { ... }
        }
      ]
    }
    ```
  - `404 Not Found`: Unowned, nonexistent, or soft-deleted documents.

---

### `GET /api/activity`
* **Description**: Retrieves activity entries across all documents owned by the caller.
* **Authentication**: Active account with owned documents.
* **Query Parameters**: Same filters as document activity.
* **Audit Event**: `AUDIT_VIEW` (fail-closed).
* **Responses**:
  - `200 OK`: Array of audit events across caller's owned documents (defense-in-depth: unowned records pruned).

---

### `GET /api/admin/activity`
* **Description**: Global activity audit stream across all system documents and actors.
* **Authentication**: Strictly `ADMIN` role with `status = 'ACTIVE'`.
* **Audit Event**: `AUDIT_VIEW` (fail-closed).
* **Responses**:
  - `200 OK`: Global audit events array.
  - `403 Forbidden`: Non-admin callers.

---

### `GET /api/admin/audit/verify` & `POST /api/admin/audit/verify`
* **Description**: Verifies the cryptographic SHA-256 hash chain (`prev_hash`, `row_hash`) across all audit log records.
* **Authentication**: Strictly `ADMIN` role with `status = 'ACTIVE'`.
* **Origin Protection**: Enforced on `POST`.
* **Rate Limit**: 5 verifications / minute per admin.
* **Audit Event**: `AUDIT_VERIFY` (fail-closed).
* **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "verification": {
        "isValid": true,
        "totalVerified": 13,
        "firstSequence": 1,
        "lastSequence": 13,
        "verifiedAt": "2026-10-25T12:00:00Z"
      }
    }
    ```
  - `403 Forbidden`: Non-admin callers.
  - `429 Too Many Requests`: Rate limit exceeded.
