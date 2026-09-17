# AGENTS.md

This file governs how any AI coding agent works inside this repository. It does not describe the product. The PRD does that. This file describes behaviour: what is locked, what must never happen, how work is arranged, and what to do when instructions run out.

If anything in this file conflicts with a comment, a chat message, or your own judgement, this file wins. If anything in this file conflicts with the PRD on a business rule, stop and ask rather than resolving it yourself.

---

## 1. What this project is

This is Task 1 of a five-task engineering assessment: **Build and Serve a Consumable API**.

The product is a public REST API serving food delivery data (restaurants, menu items, customers, orders, order items) over the internet with no login required for reads, plus one minimal web client that calls the deployed API to prove it works from the outside.

**Source of truth:** `task1-prd.md` in this repository. Every field, endpoint, status code, and requirement number referenced below (`PRD §x`) comes from that document. When this file says "see PRD §x," go read that section before writing the code. Do not guess at a requirement this file references but does not fully restate.

**Version being built:** v1 only. There is no v2 in this task. Do not build toward a v2 that does not exist yet.

**Out of scope, permanently, for this task** (PRD §3): authentication, user accounts or sessions, an admin panel, a landing page, payment processing, real-time features or websockets, a mobile app, any UI beyond the one minimal consumer described in PRD §11. If you find yourself building any of these, stop. You have left the brief.

---

## 2. What is locked

Locked means locked. Do not swap it, upgrade it, downgrade it, wrap it in something else, or replace it with something you consider better. If a locked choice seems wrong for a specific problem, say so and ask. Do not silently work around it.

### 2.1 Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js** | App Router. API routes live under `app/api/`. Do not introduce Express, Fastify, or a separate backend service. |
| Language | **TypeScript** | Strict mode on. No `.js` source files. No `any` except where a third-party type genuinely forces it, and then only with a comment explaining why. |
| ORM | **Prisma** | All database access goes through Prisma. Do not hand-write SQL except inside a documented, reviewed migration or a query the ORM genuinely cannot express, and then only with the raw query isolated in one place, not scattered. |
| Database | **PostgreSQL** | Managed Postgres in production, per PRD §12. Do not use SQLite, MySQL, or an in-memory store, including for tests, unless it is a Postgres test container. |

### 2.2 Locked design decisions from the PRD

These were decided during design and are not open for reinterpretation during implementation:

- Every primary key is a **generated UUID v4**, string type. No auto-increment integers anywhere, on any table, ever (PRD §5.1, §17).
- Every monetary value is stored as a **whole number of kobo** in a `BigInt` column. No decimals, no floats, for money, anywhere (PRD §5.1).
- Database columns use `snake_case`. JSON request and response bodies use `camelCase`. Do not mix these or let one leak into the other.
- Every table carries `created_at` and `updated_at` as UTC timestamps (PRD §5.1).
- The API is namespaced under `/api/v1` from the first commit. There is exactly one success envelope shape and exactly one error envelope shape, used by every endpoint without exception (PRD §6.1, §6.2).
- Pagination default is 20, hard maximum is 100. Cursor pagination is the primary mechanism; offset is supported as a secondary option. Both are documented in PRD §6.5. Do not implement only one.
- Rate limiting is keyed on IP, values sourced from config, per PRD §9.
- Deployment target is Railway, Render, Fly, or Vercel with managed Postgres, per PRD §12. Pick one and commit to it; do not multi-target.

### 2.3 What "locked" does not mean

Locked does not mean frozen in file structure or code style. You have full discretion over folder layout below, component structure, internal helper functions, and code style, as long as the stack and the rules in Section 3 hold.

---

## 3. What must never happen

Every rule below is a business rule or a user-protection rule. Breaking any one of them means the task has failed, even if the application builds, runs, and looks correct. A working demo that violates one of these rules is not a passing submission. Where a PRD section is named, that section is the authority for the exact behaviour.

### 3.1 Money and pricing integrity

1. Never store or transmit a monetary value as a float or a decimal. Every monetary field is an integer count of kobo. (PRD §5.1)
2. Never accept a price from the client when creating an order. `unitPriceKobo` and `nameAtOrder` on an order item are always copied server-side from the current `menu_items` row at the moment the order is created, never taken from the request body. (PRD §5.8, §6.7 rule 3)
3. Never accept `subtotalKobo`, `deliveryFeeKobo`, or `totalKobo` from the client on order creation. These are always computed server-side. (PRD §6.7 rule 4)
4. Never let an order's frozen price fields change after creation, even if the restaurant later changes its menu prices. An order is a historical record. (PRD §5.8)

### 3.2 Order integrity and state

5. Never allow a client to set `status` on order creation. Every new order is created with `status: pending`, unconditionally. (PRD §6.7 rule 5)
6. Never allow a PATCH to `/orders/:id` to touch any field except `status` and `deliveryAddress`. Any other field in the PATCH body is a 422, not a silent ignore. (PRD §6.8)
7. Never allow a transition out of `delivered` or `cancelled`. These are terminal states. An attempt returns 422. (PRD §6.8)
8. Never create an order item referencing a menu item that does not belong to the order's `restaurantId`, or that is unavailable. Reject with 422 naming the offending item. (PRD §6.7 rule 2)
9. Never accept an order with zero items or more than 50 items. (PRD §6.7 rule 1)

### 3.3 Identifier and enumeration safety

10. Never use a sequential integer as a primary key or expose one in a URL, on any table, under any circumstance. Generated UUIDs only. Breaking this makes the entire dataset enumerable by counting, which is the exact failure this rule exists to prevent. (PRD §5.1, §17)

### 3.4 API contract honesty

11. Never return HTTP 200 with an error described inside the response body. The status code is always the truth. (PRD §6.2)
12. Never let any documented input reach a 500. Every input in PRD §8's validation table has a specific, correct status code. A 500 on a documented input is a failure of this rule regardless of whether the feature "basically works."
13. Never reject a `limit` above the maximum. Clamp it to 100 and return 200. Rejecting an oversized limit is a different, wrong behaviour than the one specified. (PRD §6.5, §8)
14. Never accept both `cursor` and `offset` on the same request. Return 400 if both are present. (PRD §6.5)
15. Never validate query parameters or request bodies in more than one place. One shared validation layer, per Section 4 below, is the only place these rules may be enforced. Duplicated or handler-local validation logic is a rule violation even if it happens to produce the right status code, because it guarantees future drift.

### 3.5 Data and secrets

16. Never commit a `.env` file, a database dump, or any credential to the repository, at any commit. Verify this by inspecting the repository in a private browser window before submission, per the PRD checklist.
17. Never hardcode a config value that PRD §7 lists in its table. Pagination limits, rate limit numbers, and seed volumes are read from environment variables through one config module. A number typed directly into a handler or a seed loop is a rule violation.
18. Never write a seed script that duplicates rows on a second run. Idempotency is enforced through upserts on natural unique keys, not through "only run it once and remember not to." (PRD §10)

### 3.6 Scope discipline

19. Never build authentication, an admin panel, payments, websockets, a mobile app, or a landing page in this task. These are explicitly out of scope (PRD §3), and building any of them is a failure of this rule even if the feature itself is implemented correctly.
20. Never point the consumer application at `localhost`. Its base URL is read from an environment variable and must resolve to the deployed public URL in the evidence capture. (PRD §11, §17)

---

## 4. How the work is arranged

This structure is not specified in the PRD. It is the required layout for this task. Follow it exactly so that validation, config, and response shaping stay centralized per Section 3.5's rule 15 and 17.

```
/prisma
  schema.prisma              # all models, UUID defaults, indexes from PRD §5.9
  seed.ts                    # idempotent, config-driven, per PRD §10
  migrations/

/src
  /app
    /api
      /v1
        restaurants/
          route.ts               # GET (list)
          [id]/
            route.ts              # GET (one)
            menu/
              route.ts            # GET (nested list)
        menu-items/
          route.ts
          [id]/route.ts
        customers/
          route.ts
          [id]/
            route.ts
            orders/route.ts
        orders/
          route.ts               # GET (list), POST (create)
          [id]/route.ts          # GET, PATCH, DELETE
      health/
        route.ts                  # unversioned, exempt from rate limiting
    /consumer                     # the minimal client from PRD §11
      page.tsx

  /lib
    config.ts                 # the ONLY place env vars are read for limits, rate limit, seed volumes
    db.ts                     # single Prisma client instance, no per-file instantiation
    http/
      envelope.ts             # buildSuccess(), buildError() — used by every route, no exceptions
      errors.ts               # typed error classes mapping to the codes in PRD §6.3
    validation/
      restaurant.schema.ts
      menu-item.schema.ts
      order.schema.ts
      pagination.schema.ts    # shared limit/offset/cursor/sort/order rules, used by every list endpoint
    middleware/
      validate.ts             # single validation entry point every route calls
      rate-limit.ts           # IP-keyed, reads config.ts, sets headers, exempts /health

/docs
  /evidence                   # screenshots from PRD §15, committed and readable

.env.example                  # every key from PRD §7, placeholder values only
README.md                     # per PRD §13
AGENTS.md                     # this file
task1-prd.md
```

**Rules about this structure, not suggestions:**

- Every route handler in `app/api/v1/**` calls the shared `envelope.ts` helpers to shape its response. A handler that builds its own JSON shape inline is a violation of Section 3.4 rule 15.
- Every route handler validates its input by calling into `lib/validation/*` through `lib/middleware/validate.ts`. A handler that checks `req.query.limit` by hand is the same violation.
- `lib/config.ts` is the only file that calls `process.env` for the values in PRD §7's table. If you need one of those values anywhere else, import it from `config.ts`.
- The consumer lives inside the same Next.js app as a normal route, but it is a **client** of the API in the architectural sense: it may only reach the API through `fetch` calls to the configured base URL, never through direct Prisma or database access. Do not let the consumer page import anything from `/lib/db.ts`.

---

## 5. How the code should look

- Modern TypeScript, strict mode, no implicit `any`.
- Target the current Node.js LTS. Do not pin to an old runtime or use APIs deprecated on the LTS line.
- Prefer small, single-purpose functions over large handlers. A route file should read top to bottom as: validate, do the work, envelope the response. If a route file is doing more than that, the extra logic belongs in `/lib`.
- Name things after what they are in the PRD's language: `restaurant`, `menuItem`, `orderItem`, not generic names like `item` or `data` that force the reader to guess.
- No commented-out code, no `console.log` left in committed code, no TODO comments that describe work that should have been done before commit.
- Errors are thrown as the typed classes in `lib/http/errors.ts` and caught in one place, not scattered `try/catch` blocks with duplicated status-code logic in every handler.
- Comments explain why a non-obvious decision was made, not what the next line of code obviously does.
- Every exported function that isn't trivially self-explanatory gets a one-line docstring stating its purpose, its inputs, and what it throws.

---

## 6. What counts as done

Before this task is presented as complete, verify every line below. This checklist is the same list as PRD §14, restated as a build-time gate.

- [ ] The project builds with zero TypeScript errors and zero lint errors.
- [ ] Three or more resources exist and reference each other (PRD §5).
- [ ] A nested endpoint demonstrates a relationship (`/restaurants/:id/menu`).
- [ ] Every primary key is a generated UUID. No sequential integers exist anywhere in the schema.
- [ ] `prisma/seed.ts` runs, is idempotent on a second run, and produces the volumes configured in `.env.example`.
- [ ] Every API path is prefixed `/api/v1`.
- [ ] Every list endpoint supports pagination, at least two filters, and sorting, and all three work together in one request.
- [ ] The success envelope is byte-for-byte identical in shape across every endpoint. The error envelope is byte-for-byte identical in shape across every endpoint.
- [ ] 400, 404, 422, and 429 are each reachable through a real request, and none of them are reachable through 500 instead.
- [ ] `limit` defaults to 20 and clamps to 100 without erroring.
- [ ] Rate limiting returns 429 with a `Retry-After` header once the configured threshold is crossed.
- [ ] Every numeric config value in PRD §7 is read from `lib/config.ts`, not hardcoded.
- [ ] `.env` is absent from the repository, verified by inspection. `.env.example` is present and complete.
- [ ] The README documents every endpoint with a working curl example and includes the Design decisions section from PRD §13.
- [ ] The API is deployed to a public URL, backed by managed Postgres, and the production database has been seeded.
- [ ] The consumer app's base URL points at the deployed public URL, not `localhost`, and it renders an empty state and an error state, not only the happy path.
- [ ] All five evidence screenshots from PRD §15 exist in `/docs/evidence` and are readable.
- [ ] Commit history is incremental, not a single squashed commit.
- [ ] Nothing exists in the codebase that PRD §3 places out of scope.

If any box above cannot be checked, the task is not done, regardless of how much of it is finished.

---

## 7. What to do when unsure

You will hit gaps. The PRD is detailed but not infinite. When you hit one:

1. **Do not invent a feature to fill the gap.** If the PRD doesn't specify a field, an endpoint, or a behaviour, the answer is not to design one yourself and build it. Scope is fixed at what PRD §3 and §6 describe. An unrequested feature is a rule violation under Section 3.6, not a helpful addition.
2. **Do not guess silently and move on.** If a requirement is genuinely ambiguous, stop at that point, state the ambiguity plainly, state the interpretation you are about to take, and proceed only with that stated. Do not bury the assumption in a comment three files away.
3. **Never patch around a locked choice.** If Prisma, Next.js, TypeScript, or PostgreSQL seem to make something harder than a different tool would, that is not license to introduce the other tool. Say what the difficulty is and ask.
4. **Never let a blocked step turn into scattered, exploratory code.** If you cannot complete a step cleanly, stop at the last clean, working state rather than pushing forward with unstructured, untested code to "get something working." Half of a correctly structured feature is recoverable. A pile of spaghetti bolted on to make a demo look done is not.
5. **When a business rule in Section 3 would be violated by the fastest path to a working feature, the business rule wins.** Slower and correct beats fast and wrong, every time, without exception, for every rule in Section 3.
6. **If the PRD and this file ever appear to disagree on a business rule**, stop and flag it rather than picking one. If they disagree on something stylistic or structural, this file wins per the header.