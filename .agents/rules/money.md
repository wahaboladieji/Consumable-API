---
trigger: glob
---

# money.md

Every rule in this file is absolute. There is no "usually" or "except when
convenient" anywhere below. A violation here is a failure even if every number
displayed in the UI looks correct today, because these bugs are silent until
they compound, and by the time they're visible they've already corrupted
historical data or been exploited.

## Storage

1. Every monetary amount is stored as an integer count of kobo (the smallest
   unit of the currency), as `BigInt`, in the database.
2. `Float` and `Decimal` types are forbidden for any monetary field, in the
   schema, in application code, and in API payloads. No exceptions, including
   for "temporary" calculations or in-memory values.
3. Currency is fixed at NGN for this system. If a value's currency is ever
   ambiguous, it is a bug; do not infer a currency, reject the ambiguity.

## Computation

4. `subtotalKobo`, `deliveryFeeKobo`, and `totalKobo` on an order are always
   computed server-side, at the moment the order is created, from trusted
   server-side data (the menu item's current price, the restaurant's current
   delivery fee). The client never supplies any of these three values, and if
   a request body contains them, they are ignored or rejected, never used.
5. `orderItems[].unitPriceKobo` and `orderItems[].nameAtOrder` are copied from
   the menu item at the exact moment the order is created. This is a
   deliberate freeze, not a lookup. Once written, these values never change,
   even if the underlying menu item's price changes afterward.
6. An order's frozen monetary fields are never recalculated, backfilled, or
   "corrected" by any later process, migration, or admin action. If a past
   order is wrong, it is corrected by a new record (a refund, an adjustment),
   never by mutating the historical row.

## Client trust boundary

7. The client can never set a price for anything, on any endpoint, at any
   point. Every price a client sees in a response is one the server produced.
8. If validation logic and money logic ever appear to disagree about what a
   request should compute, the money rules in this file win. Do not resolve
   the disagreement by loosening a money rule to make validation simpler.

## When unsure

If a new feature seems to need a monetary calculation this file doesn't cover,
do not improvise a rounding rule, a currency conversion, or a float shortcut to
get it working. Stop and ask. Money logic is the one place in this codebase
where "close enough for the demo" is not an acceptable temporary state.