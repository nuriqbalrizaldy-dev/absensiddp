# Security Specification & Payload-First TDD

## 1. Data Invariants
1. `training_config/current` holds only non-PII training title and schedule dates. Public `get` is permitted solely on document ID `'current'` so participants can render the active training sheet; `list`, `create`, `update`, and `delete` are strictly restricted to verified admins (`isAdmin()`).
2. `attendances/{attendanceId}` holds participant PII (`fullName`, `position`) and `signatureDataUrl`. Public `create` is permitted only when passing strict schema, size, regex, and server timestamp (`request.time`) validation so participants can submit attendance without creating accounts. Public `get`, `list`, `update`, and `delete` are strictly denied (`false` for non-admins); only `isAdmin()` can `get`, `list`, or `delete` attendance records.
3. `admins/{adminUid}` can only be read, created, or deleted by `isAdmin()`.
4. `isAdmin()` strictly requires `request.auth != null && request.auth.token.email_verified == true` and either the bootstrapped PIC email (`nuriqbalrizaldy@gmail.com`) or an existing `admins/$(request.auth.uid)` document.
5. Every `create`/`update` enforces `keys().hasAll(...) && keys().hasOnly(...)` to block shadow fields and `request.time` for timestamps.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated `list` on `/attendances`**: Anonymous visitor tries to read participant names & signatures -> DENIED.
2. **Unauthenticated `get` on `/attendances/{id}`**: Anonymous visitor tries to read a single attendance doc -> DENIED.
3. **Authenticated non-admin `list` on `/attendances`**: Random signed-in Google user tries to scrape attendance logs -> DENIED.
4. **Unverified email admin spoof on `/training_config/current`**: Token with `email: 'nuriqbalrizaldy@gmail.com'` and `email_verified: false` tries to update training title -> DENIED.
5. **Shadow field on `/attendances` create**: Payload includes `{ fullName, position, sessionDate, signatureDataUrl, trainingTitle, submittedAt, isAdminApproved: true }` -> DENIED by `hasOnly`.
6. **Client-forged timestamp on `/attendances` create**: `submittedAt` is set to a past client timestamp instead of `request.time` -> DENIED.
7. **Oversized signature payload (Denial of Wallet)**: `signatureDataUrl` exceeds `180000` characters -> DENIED.
8. **Invalid signature prefix / HTML injection**: `signatureDataUrl` is `<script>alert(1)</script>` instead of `data:image/png;base64,...` -> DENIED by regex guard.
9. **Invalid `sessionDate` format**: `sessionDate` is `"2026-11-23"` or arbitrary 500-char string instead of `DD/MM/YYYY` -> DENIED.
10. **Path ID poisoning on `/attendances/{id}`**: Document ID contains invalid characters or exceeds 128 chars -> DENIED by `isValidId`.
11. **Non-admin update on `/training_config/current`**: Regular user tries to change `title` or `dates` -> DENIED.
12. **Self-assigned admin escalation on `/admins/{uid}`**: Non-admin authenticated user tries to create `/admins/{theirUid}` -> DENIED.
