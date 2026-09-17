---
name: validation-and-error-mapping
description: Use before authoring or modifying any Zod schema under lib/validation/*.schema.ts, for request bodies or query strings. Teaches how to decide whether a given failure is malformed input (400) versus well-formed but business-invalid input (422), and how to encode that decision correctly in the schema and the shared error classes.
---

# Validation and Error Mapping

coding-standards.md and security.md both require that all input validation happen in one shared layer, with no handler-local checks. This skill teaches the judgment call that layer has to make repeatedly: deciding whether a given bad input is a **400** or a **422**. Getting this distinction wrong is easy and the PRD grades it explicitly (PRD §8's validation table, PRD §6.3's error code table).

## The rule that resolves every case

**400 (Bad Request):** the request itself is malformed. The server cannot even understand what was asked, independent of any business data. Ask: "would this fail the exact same way against an empty database?" If yes, it's 400.

**422 (Validation Error):** the request is well-formed and understandable, but violates a rule that depends on business state or business logic. Ask: "does answering this correctly require knowing something about the data — does this restaurant exist, is this quantity a sane order amount, does this menu item belong to this restaurant?" If yes, it's 422.

**404 (Not Found):** a well-formed identifier that is syntactically valid but matches no row. This is distinct from both of the above — the request was understandable, and no business rule was violated, the thing simply isn't there.

## Worked classification table

Use this table as the pattern to extend for any new schema, not as an exhaustive list.

| Input | Classification | Why |
|---|---|---|
| `limit=-3` | 400 | Malformed regardless of what data exists |
| `sort=banana` | 400 | Not a real field name, fails against any dataset |
| `cursor=not-base64` | 400 | Can't even be decoded |
| a path param that isn't a valid UUID shape | 400 | Malformed identifier, never reaches the database |
| a syntactically valid UUID with no matching row | 404 | Well-formed, understandable, simply absent |
| missing `deliveryAddress` on order creation | 422 | Well-formed request, missing a required business field |
| `quantity: 0` on an order item | 422 | Syntactically a number, but violates the business rule that quantity must be >= 1 |
| a `menuItemId` that exists but belongs to a different restaurant | 422 | Requires a database lookup to know it's wrong — this is a business-state violation, not a shape violation |
| a PATCH body containing a field other than `status` or `deliveryAddress` | 422 | The shape is "wrong" in a business sense (this endpoint doesn't accept that field), not a parsing failure |

## How to structure a schema so this distinction is enforced automatically

1. **Shape validation (produces 400) lives in the Zod schema itself.** Types, required-ness of primitive fields, string length bounds, enum membership for `sort`/`order`, numeric bounds like `quantity >= 1`. If `schema.safeParse()` fails, that's always a 400 for query params and path params, and always a 422 for request bodies (see the split below) — the schema layer never has to guess which, because it's the same layer every time.

2. **Business-state validation (produces 422 or 404) happens after the schema passes**, inside the handler's stage 2 ("authorize / check existence" — see the `api-endpoint-implementation` skill), because it requires a database read the schema layer doesn't have access to.

3. **One split to hold onto:** malformed *query parameters and path parameters* (things that shape the request itself) are 400. Malformed *request bodies* (the payload describing what to create or change) are 422, per PRD §6.3, even when the failure is a basic type mismatch. A missing `deliveryAddress` is a shape problem, but the PRD assigns it 422 because it's part of the payload being validated as a unit, not part of routing the request. Don't override this with the 400-for-shape-failures instinct from rule 1; rule 1 governs params, this governs bodies.

## Writing the schema

```ts
// lib/validation/order.schema.ts
export const createOrderSchema = z.object({
  customerId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  deliveryAddress: z.string().min(5).max(200),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().min(1),
      })
    )
    .min(1)
    .max(50),
}).strict(); // .strict() rejects unknown keys — this is how a client-supplied
             // "price" or "status" field on the body gets rejected at the
             // schema layer, satisfying security.md rule 6 automatically.
```

Use `.strict()` (or an equivalent unknown-key rejection) on every body schema. This is what turns "the client tried to set totalKobo" into an automatic 422 without the handler having to remember to check for it.

## Wiring into the shared error classes

Every validation failure throws one of the typed classes in `lib/http/errors.ts`:

```ts
throw new BadRequestError("sort must be one of: rating, deliveryFeeKobo, createdAt, name");
throw new ValidationError([{ field: "items[0].quantity", issue: "must be >= 1" }]);
throw new NotFoundError("Restaurant not found");
```

The shared error handler maps each class to its status code and builds the standard error envelope. A handler or schema that constructs its own error response object instead of throwing one of these classes is a coding-standards.md violation, not just an inconsistency.

## Self-check before considering a schema done

- For every field, could I explain in one sentence whether its failure is 400, 404, or 422, and does that match the table above?
- Does the body schema use `.strict()` (or equivalent) so an unexpected field is rejected rather than silently ignored?
- Is there any check happening inside the route handler that should have lived in the schema, or vice versa? Business-state checks (existence, ownership, availability) never belong in the schema — they need a database read.
