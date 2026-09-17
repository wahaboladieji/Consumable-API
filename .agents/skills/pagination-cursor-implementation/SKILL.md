---
name: pagination-cursor-implementation
description: Use when building or editing any GET list endpoint (restaurants, menu-items, customers, orders, or the nested restaurants/:id/menu route) that must support limit, cursor, offset, sort, and order per PRD section 6.5. Teaches how to encode and decode a keyset cursor, clamp limit, reject conflicting cursor and offset, and compute hasMore and meta correctly at the boundary.
---

# Pagination and Cursor Implementation

Every list endpoint in this project uses the same pagination contract (PRD §6.5). This skill exists because the rules files state the constraints — default 20, max 100, cursor and offset are mutually exclusive, malformed input is 400 — but do not teach the actual keyset-cursor technique or where the boundary conditions bite.

Implement this once as a shared helper in `lib/pagination.ts` and call it from every list endpoint. Do not reimplement this logic per-endpoint; that guarantees the five endpoints drift out of sync with each other.

## The contract, restated as implementation requirements

| Input | Required behavior |
|---|---|
| no `limit` | default to 20 |
| `limit` above 100 | clamp to 100, return 200 — never reject |
| `limit <= 0` | 400 |
| `cursor` and `offset` both present | 400 |
| malformed `cursor` (fails to decode) | 400 |
| `sort` not on the endpoint's allowlist | 400 |
| `order` not `asc` or `desc` | 400 |

## Why keyset (cursor) pagination, not just offset

Offset pagination (`OFFSET n LIMIT m`) recounts and discards `n` rows on every request, which gets slow at depth, and it is unstable: a row inserted or deleted while a client pages through causes rows to be skipped or repeated. Keyset pagination instead remembers the last row's sort key and asks the database to continue from there directly, which is both fast at any depth and stable under concurrent writes. This project supports both because the PRD explicitly asks for both, but cursor is the primary, recommended mechanism.

## How to build the cursor

A cursor encodes enough information to resume the query exactly where the last page left off: the value of the sort column on the last row, plus the row's `id` as a tiebreaker (needed because the sort column alone may have duplicate values, e.g. two restaurants with the same rating).

1. **Encoding.** Build a small object `{ v: <sort field value>, id: <row id> }`, `JSON.stringify` it, then base64-encode the string. This is the opaque token returned as `meta.nextCursor`.
2. **Decoding.** Base64-decode the incoming `cursor` string, `JSON.parse` it, and validate the result has both `v` and `id` of the expected types. If decoding or validation fails at any step, throw a `BadRequestError` — never let a malformed cursor reach the database query.
3. **Querying.** Use the decoded `{ v, id }` to build a Prisma `where` clause that continues past that row. For a descending sort on `rating` with `id` as tiebreaker:

   ```ts
   where: {
     OR: [
       { rating: { lt: cursor.v } },
       { rating: cursor.v, id: { lt: cursor.id } },
     ],
   },
   orderBy: [{ rating: "desc" }, { id: "desc" }],
   ```

   The direction of the comparison (`lt` vs `gt`) flips with `order: asc` vs `order: desc`. Get this backwards and pagination silently returns the wrong page instead of erroring, which is worse than a crash because nothing flags it.

4. **Fetch one extra row.** Query for `limit + 1` rows. If you get back `limit + 1`, there is a next page: set `hasMore: true`, encode `nextCursor` from the row at index `limit - 1` (the last row actually returned, not the extra one), and drop the extra row before returning `data`. If you get back `limit` or fewer, `hasMore: false` and `nextCursor` is omitted or `null`.

## Offset mode

When the client sends `offset` instead of `cursor`:

1. Validate `offset >= 0`, else 400.
2. `SKIP offset TAKE limit` (Prisma: `skip`, `take`).
3. `meta.total` is a separate `COUNT` query. `hasMore = offset + limit < total`.
4. A request for an offset beyond the end of the dataset (e.g. page 50 of 30 pages) is **not an error**. It returns 200 with `data: []`, the real `total`, and `hasMore: false`. This is one of the four defence questions in the PRD — asking for a page beyond the end is a legitimate question with a legitimate, empty answer, not a failure.

## Boundary conditions to test by hand before considering this done

- `limit=0` and `limit=-3` both return 400.
- `limit=5000` returns 200 with exactly 100 rows, not an error.
- Two rows with an identical sort value (e.g. two restaurants both rated 4.5) are paginated correctly and neither is skipped nor duplicated across pages — this is the case the `id` tiebreaker exists to solve.
- The last page returns `hasMore: false` and no `nextCursor`, even if it happens to contain exactly `limit` rows (do not assume "full page" means "more exist").
- `?cursor=not-valid-base64` returns 400, not a 500 from a failed `JSON.parse`.
- `?cursor=X&offset=5` (both present) returns 400 regardless of whether either value alone is valid.
