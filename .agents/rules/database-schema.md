---
trigger: glob
---

# database-schema.md

Applies to `prisma/schema.prisma` and every migration. The schema described here,
and in the PRD, is the schema. Do not add, remove, or redesign a table, column, or
relationship that isn't specified there without flagging it first. This file holds
only rules where skipping them causes a failure that isn't visible in a demo.

## Identifiers

1. Every primary key on every table MUST be a generated UUID v4, stored as a
   string. Sequential/auto-increment integer keys are forbidden anywhere in this
   schema, with no exceptions, including on join tables.
   Reason: a sequential key makes the entire table enumerable by counting. This is
   a data-exposure bug, not a style choice, and it does not show up in a demo.

## Money

2. Every monetary column is an integer count of the smallest currency unit
   (kobo), stored as `BigInt`. Never `Float`, never `Decimal`, never a string
   representation of an amount, anywhere in this schema.
   (Full rule set: see `money.md`. This entry exists so the schema itself cannot
   drift from that rule.)

## Naming and typing

3. Column names are `snake_case`. Prisma model fields map to `camelCase` in the
   generated client; do not fight this mapping by renaming columns to match JSON.
4. Every table has `created_at` and `updated_at`, both UTC timestamps, both set
   by the database or the ORM, never computed client-side.

## Relationships and integrity

5. Foreign keys are enforced at the database level, not only checked in
   application code. A relationship described in the PRD (restaurant → menu
   items, customer → orders, order → order items) has a real FK constraint.
6. `order_items.nameAtOrder` and `order_items.unitPriceKobo` are copies frozen at
   the moment the order item is created. They are never re-derived from the
   current state of `menu_items` after creation, and no migration or backfill
   may "correct" a historical order to match a current menu price.
   Reason: an order is a historical record. Silently letting it drift when a
   restaurant changes prices corrupts every past order without anyone noticing
   until reconciliation happens.
7. `orders.deliveryFeeKobo` is likewise frozen at creation from the restaurant's
   fee at that moment, not re-read live.
8. Cascade deletes apply where the PRD specifies them (menu items cascade from
   their restaurant, order items cascade from their order) and nowhere else.
   Do not add a cascade "for convenience" on a relationship the PRD didn't mark.

## Indexes

9. Every index in the PRD's index table exists in the schema before the task is
   considered done. Do not add an index the PRD doesn't call for without noting
   why in a migration comment; unnecessary indexes cost writes for no benefit and
   are themselves a violation of staying inside scope.

## Migrations

10. All schema changes go through Prisma migrations. Raw SQL against the
    production database, outside a committed migration file, is forbidden.
11. No database dump is ever committed to the repository. The seed script (see
    `git-conventions.md` and the PRD) is the only mechanism for populating data.

## When unsure

If a new field or relationship seems useful but is not in the PRD, do not add it.
Flag the gap. A schema change that isn't in the PRD is scope creep even if it
would make the app "better."