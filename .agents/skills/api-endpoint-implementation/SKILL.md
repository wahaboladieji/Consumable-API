---
name: api-endpoint-implementation
description: Use when creating or editing any file under app/api/v1/**/route.ts, for both read endpoints and write endpoints, including the order-creation write path. Teaches how to wire a Next.js App Router handler to the shared validation, business-logic, and envelope layers in the correct order, with order creation as the worked example for freezing prices and computing totals server-side.
---

# API Endpoint Implementation

This skill governs the shape of every route handler in this project. It exists because AGENTS.md and coding-standards.md state *which* shared modules a handler must use (`validate.ts`, `envelope.ts`, `errors.ts`) but do not teach the mechanics of wiring them together correctly in a Next.js App Router file, or the exact sequence a money-safe write endpoint must follow.

Read `money.md` and `security.md` before implementing any write endpoint. Nothing in this skill overrides a rule in those files.

## The fixed shape of every handler

Every `route.ts` file reads top to bottom as four stages, in this order, no exceptions:

1. **Validate** the input (query params, path params, or body) through `lib/middleware/validate.ts`.
2. **Authorize / check existence** of any referenced resource (does this restaurant exist, does this menu item belong to it).
3. **Do the work** (a Prisma query or write), inside a transaction if the work touches more than one table.
4. **Envelope the response** through `lib/http/envelope.ts`, or throw a typed error from `lib/http/errors.ts` and let the shared error handler map it to a status code.

If a handler does anything beyond these four stages, that logic belongs in `/lib`, not inline in the route file (coding-standards.md, rule 9).

## Next.js App Router mechanics

- Each HTTP method is a named export: `export async function GET(req: Request) { ... }`, `export async function POST(req: Request) { ... }`.
- Dynamic segments come from the second argument: `export async function GET(req: Request, { params }: { params: { id: string } })`.
- Read query parameters with `new URL(req.url).searchParams`, never by parsing the raw string yourself.
- Read the JSON body with `await req.json()`, wrapped so a malformed body is caught by validation as a 400, not thrown as an unhandled exception.
- Return a `Response` (or `NextResponse.json(...)`) built exclusively by the envelope helpers. Never call `Response.json` directly from inside a handler.

## Read endpoints (GET, list and single)

1. Validate query params (see `validation-and-error-mapping` skill for the 400 vs 422 decision, though list endpoints are almost always 400-only since there's no business state to violate).
2. If this is a list endpoint, hand off filter/sort/pagination parsing to the `pagination-cursor-implementation` skill's helpers — do not reimplement cursor logic inline.
3. Build the Prisma `where` clause from the validated filter object only. Never interpolate a raw query string into a `where` clause.
4. Run the query, envelope the result.
5. For a single-item GET, a `null` result from Prisma is a `NotFoundError`, not an empty success response.

## Write endpoints (POST, PATCH, DELETE)

1. Validate the body against the resource's schema.
2. For any foreign key in the body (`restaurantId`, `customerId`, `menuItemId`), confirm the referenced row actually exists before using it. A dangling reference is a 404 or 422 per the endpoint's contract in the PRD, never a database-level foreign key crash surfaced as a 500.
3. Perform the write inside `prisma.$transaction(...)` whenever more than one table is touched (order + order_items is the canonical case).
4. Return the correct success status: 201 for creation, 200 for a read or update, 204 with no body for deletion.

## Worked example: `POST /api/v1/orders`

This is the highest-stakes endpoint in the project and the reason this skill exists. Follow this sequence exactly.

1. Validate the body shape: `customerId`, `restaurantId`, `deliveryAddress`, `items[]` (1 to 50 entries, each with `menuItemId` and `quantity >= 1`). Reject anything else in the body per security.md rule 6 and rule 7 — a client-supplied `price`, `status`, `subtotalKobo`, or similar field on this or any write endpoint is dropped, never read.
2. Confirm `customerId` exists. Confirm `restaurantId` exists. Missing either is a 404.
3. For every item in `items[]`, load the referenced `menu_items` row. If it doesn't exist, doesn't belong to `restaurantId`, or `isAvailable` is false, fail the whole request with a 422 naming that specific item (money.md rule 7, security.md rule 8). Do not partially create an order.
4. Inside a single transaction:
   - Copy `name` → `nameAtOrder` and `priceKobo` → `unitPriceKobo` from each menu item onto its order item row. This is a freeze, not a live reference (money.md rule 5).
   - Compute `subtotalKobo` as the sum of `unitPriceKobo * quantity` across all items, server-side, in integer kobo, no floating-point arithmetic at any intermediate step.
   - Copy the restaurant's current `deliveryFeeKobo` onto the order as `deliveryFeeKobo` (money.md rule 5).
   - Compute `totalKobo = subtotalKobo + deliveryFeeKobo`.
   - Set `status: "pending"` unconditionally. The client cannot influence this field (money.md rule 4, security.md rule 6).
   - Write the order row and all order_item rows in the same transaction, so a failure partway never leaves an order with no items or items with no order.
5. Envelope the created order, with its items, as the response body with a 201 status.

## Worked example: `PATCH /api/v1/orders/:id`

1. Validate that the body contains only `status` and/or `deliveryAddress`. Any other key present is a 422 (security.md rule 7).
2. If `status` is present, load the current order first. If its current status is `delivered` or `cancelled`, reject the transition with a 422 regardless of what the new status would be (security.md rule 8, money.md's terminal-state logic). Only then apply the update.

## Self-check before considering a handler done

- Does every code path through this file go through `validate.ts` and `envelope.ts`? No handwritten status codes.
- Could the client set any field this file computes itself? If yes, that's a security.md and money.md violation, fix it before moving on.
- Is every multi-table write inside one transaction?
- Does a 500 ever occur for a plausible, documented bad input? If you can construct one, the handler is not done.
