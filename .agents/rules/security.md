---
trigger: always_on
---

# security.md

This API has no login on read endpoints by design (see PRD). That means every
protection this system has lives in validation and rate limiting; there is no
session to fall back on. Every rule below maps to a specific abuse this design
is already exposed to. Breaking any of these is a failure even if the endpoint
demos correctly, because the failure mode only appears under attack, not under
a happy-path test.

## Public-surface protection

1. Rate limiting is active on every route except `/health`, keyed on client IP,
   sourced entirely from `lib/config.ts`. A route added later without rate
   limiting is a violation by omission.
2. Exceeding the limit returns 429 with a `Retry-After` header. It never returns
   200, and it never silently drops the request without a response.
3. No route may return an unhandled 500 for any documented input. An
   unanticipated crash on malformed input is treated as a security bug, not
   just a stability bug, because it can indicate an unvalidated path to the
   database or an unhandled type coercion.

## Enumeration protection

4. All resource identifiers are generated UUIDs (full rule in
   `database-schema.md`). This file exists to state why it's a security rule,
   not only a schema rule: sequential IDs let any anonymous caller enumerate
   the entire dataset with no additional effort.

## Input trust boundary

5. Every value that reaches a database write comes from either (a) the
   validated request body, run through the shared schema in
   `lib/validation/`, or (b) a value computed server-side. Nothing is trusted
   from the client beyond what the schema explicitly allows.
6. A client can never set a value that the PRD defines as server-computed:
   price, name-at-order, subtotal, delivery fee, total, or order status at
   creation. (Full list and reasoning: `money.md`.) Accepting any of these
   from a request body, even if unused elsewhere, is a violation, because an
   unused-but-accepted field is a bug waiting for the next feature to trust it.
7. `PATCH /orders/:id` accepts exactly two fields: `status` and
   `deliveryAddress`. Any other field present in the body is a 422, not a
   silently ignored extra key.
8. State transitions are enforced server-side. An order in `delivered` or
   `cancelled` cannot be moved to any other status by any request, regardless
   of what the client sends.

## Information disclosure

9. Error responses never include a stack trace, an internal file path, a raw
   database error message, or any implementation detail. The error envelope
   contains only `code`, a human-readable `message`, and, for validation
   errors, the specific fields that failed. Internal errors are logged
   server-side and returned to the client as a generic `INTERNAL_ERROR` message.
10. Logs may contain request metadata for debugging but never a full request
    body containing customer PII (email, phone, address) at anything above
    debug level in a non-development environment.

## Secrets

11. No credential, API key, or connection string is ever hardcoded in source.
    All of it comes from environment variables via `lib/config.ts`. Enforcement
    of what enters git is `git-conventions.md`'s responsibility; this rule is
    about what the *code* is allowed to contain, independent of git history.

## When unsure

If a new endpoint or field introduces a way for a client to influence something
that should be server-controlled, treat it as a security question first, not a
feature question. Default to rejecting the input and ask, rather than accepting
it and hoping validation elsewhere catches it.