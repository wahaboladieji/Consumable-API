---
name: seed-script-authoring
description: Use before writing or modifying prisma/seed.ts. Teaches how to seed interdependent tables (restaurants, menu_items, customers, orders, order_items) in foreign-key-safe order with deterministic Faker output and upsert-based idempotency, so reruns never duplicate data.
---

# Seed Script Authoring

database-schema.md requires the seed script to be idempotent. It does not teach how to achieve that across five interdependent tables. This skill covers the technique. Getting this wrong produces one of the PRD's named traps: deploying without a successful seed, or a seed that duplicates on every rerun.

## The dependency order is fixed by the schema

Seed in this exact order, because each later table has a foreign key into an earlier one:

1. `restaurants` (no dependencies)
2. `menu_items` (depends on `restaurants`)
3. `customers` (no dependencies — can run in parallel with 1 and 2, but simplest to just go in sequence)
4. `orders` (depends on `customers` and `restaurants`)
5. `order_items` (depends on `orders` and `menu_items`)

Seeding out of this order causes a foreign key violation on insert. If you ever see one, the first thing to check is whether a later table's seed step ran before its dependency finished.

## Deterministic generation

Call `faker.seed(<fixed number>)` once, at the top of the script, before any `faker.*` calls. This makes every run generate the exact same fake data in the exact same order, which is what makes upsert-based deduplication reliable — the same conceptual "restaurant #47" gets the same name and the same natural key on every run, so the upsert recognizes it as the same row rather than a new one.

```ts
import { faker } from "@faker-js/faker";
faker.seed(20260917); // fixed, arbitrary, committed — never randomize this
```

## Idempotency through upsert on a natural key

The technique: generate a *natural, human-meaningful unique key* for each row (not the UUID primary key, which is randomly generated fresh on the database side and can't be used to recognize "the same row" across runs), and upsert on that key.

- `restaurants.slug` is the natural key (derive it from the generated name: `faker.helpers.slugify(name).toLowerCase()`).
- `customers.email` is the natural key (already unique per schema).
- `menu_items` has no single unique natural field — use a composite: upsert on `(restaurantId, name)` via a compound unique constraint, or check-then-create if a compound unique isn't declared in the schema.
- `orders` and `order_items` are the trickiest, because a real order has no natural "identity" independent of being created. Give them a deterministic natural key too: derive a stable string from the seed loop index (e.g. `seed-order-000042`) and store it in a nullable `seedKey` column used only for upsert matching, or, simpler, only ever create orders on a `--fresh` run and skip order seeding entirely on a plain rerun once orders already exist (check `orders.count() > 0` and skip the whole orders+order_items block if so).

```ts
await prisma.restaurant.upsert({
  where: { slug },
  update: {}, // rerunning should not silently change existing data
  create: { id: undefined, slug, name, cuisine, address, city, rating, deliveryFeeKobo, isOpen: true },
});
```

`update: {}` is deliberate: a rerun should recognize the row already exists and leave it alone, not overwrite it with newly-generated (but seeded-identical, since faker.seed is fixed) values. This is what makes "run it twice" produce zero net change instead of either duplicates or silent overwrites.

## The `--fresh` flag

Support one explicit reset path, separate from the default idempotent path:

```ts
if (process.argv.includes("--fresh")) {
  // delete in reverse dependency order: order_items, orders, menu_items, customers, restaurants
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.restaurant.deleteMany();
}
```

Deletion order is the reverse of creation order, for the same foreign-key reason. Without `--fresh`, the script only upserts and never deletes.

## Volumes come from config, not from hardcoded loop bounds

Per coding-standards.md rule 8 and the PRD's config table, the seed script reads its target row counts (`SEED_RESTAURANTS`, `SEED_MENU_ITEMS_PER_RESTAURANT`, `SEED_CUSTOMERS`, `SEED_ORDERS`) from `lib/config.ts`, not as numbers typed into the loop.

```ts
import { config } from "../src/lib/config";
for (let i = 0; i < config.seed.restaurants; i++) { /* ... */ }
```

## Realistic, not just present, data

- Prices and ratings should fall in plausible ranges, not uniform random across the full possible domain (e.g. ratings clustered between 3.0 and 5.0, not evenly spread 1.0–5.0, since that's what real restaurant ratings look like).
- Spread `orders.createdAt` across roughly the last 90 days rather than all at the moment of seeding, so that date-based sorting in the API actually demonstrates something when tested.
- Every `order_items` row must reference a `menu_items` row that belongs to the same restaurant as its parent order — pick the menu item pool for each order's items from that restaurant's own menu, never from the global pool.

## Never commit a dump instead of a script

git-conventions.md and database-schema.md both forbid committing a database dump. The seed script itself, generating data at run time, is the only thing that gets committed. If you're ever tempted to `pg_dump` a working dataset and commit that instead of fixing the seed script, stop — that's explicitly disallowed.

## Self-check before considering the seed script done

- Run `npm run seed` twice in a row against a fresh database. Row counts after the second run must equal row counts after the first run, exactly.
- Every `order_items` row's `menuItemId` belongs to the same restaurant as its `orders.restaurantId`.
- The script prints a summary of rows created (or "already present, skipped") per table, so a reviewer can see the outcome without querying the database directly.
- No credential or connection string is hardcoded in the script — it reads `DATABASE_URL` the same way the rest of the app does.
