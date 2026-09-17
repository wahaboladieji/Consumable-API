# Product Requirements Document
## Task 1: Build and Serve a Consumable API

**Version:** 1.0
**Status:** Draft, ready to build
**Time budget:** 12 to 16 hours
**Chosen market:** Food delivery

---

## 1. Summary

A public, read-mostly REST API that serves realistic food delivery data over the internet, plus a minimal web client that consumes the deployed API and displays the result.

The API is the product. The client exists only to prove the API works from outside its own codebase.

---

## 2. Goals

| # | Goal | How we know it is met |
|---|---|---|
| G1 | Anyone on the internet can call the API without credentials | A `curl` from a machine that is not the developer's returns data |
| G2 | The data has real relationships, not flat records | At least three resources reference each other, with a nested endpoint proving it |
| G3 | The API behaves predictably under bad input | Every invalid input returns a documented status code, never a 500 |
| G4 | The API can be used from the README alone | A developer who has never spoken to the author can make a successful call |
| G5 | The API survives being public | Rate limiting returns 429 before abuse degrades the service |
| G6 | Pagination, filtering and sorting work together, not just separately | The consumer app filters a list and pages through the filtered result |

---

## 3. Non-goals

These are explicitly out of scope. Building them counts against the submission.

- No authentication or login for read endpoints
- No user accounts, profiles or sessions
- No admin panel or CMS
- No landing page, marketing site or branding
- No payment processing
- No real-time features, websockets or notifications
- No mobile app
- No UI beyond the minimal consumer described in section 10

---

## 4. Users

| User | What they need |
|---|---|
| A third-party developer | To list, filter and page through restaurants and menus, and to place an order, using only the README |
| The reviewer | To verify each requirement against evidence, and to question the design decisions |
| The consumer app | A stable, versioned contract it can call from a browser |

---

## 5. Data model

Five tables. Four are resources exposed over the API. `order_items` is a join table and is not exposed as a top-level resource.

### 5.1 Conventions applied to every table

- **Identifiers.** Every primary key is a generated UUID v4 stored as a string. No sequential integers anywhere. Reason: sequential ids let any caller enumerate the entire dataset by counting upward.
- **Money.** Every monetary value is a whole number of kobo (minor units) in a `BIGINT` column, with the currency fixed at NGN and recorded in the README. No floats, no decimals.
- **Time.** Every table has `created_at` and `updated_at` as UTC timestamps.
- **Naming.** Snake case in the database, camel case in JSON responses.

### 5.2 restaurants

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | generated |
| name | string(120) | yes | |
| slug | string(140) | yes | unique |
| cuisine | string(40) | yes | enum-like, e.g. pizza, jollof, grill, sushi |
| address | string(200) | yes | |
| city | string(60) | yes | filterable |
| rating | decimal(2,1) | yes | 1.0 to 5.0, sortable |
| deliveryFeeKobo | bigint | yes | sortable |
| isOpen | boolean | yes | default true |
| createdAt | timestamp | yes | |
| updatedAt | timestamp | yes | |

### 5.3 menu_items

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | generated |
| restaurantId | uuid | yes | FK to restaurants, cascade delete |
| name | string(120) | yes | |
| description | text | no | |
| category | string(40) | yes | filterable, e.g. mains, sides, drinks |
| priceKobo | bigint | yes | filterable and sortable |
| isAvailable | boolean | yes | default true |
| createdAt | timestamp | yes | |
| updatedAt | timestamp | yes | |

### 5.4 customers

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | generated |
| fullName | string(120) | yes | |
| email | string(160) | yes | unique |
| phone | string(20) | yes | |
| city | string(60) | yes | |
| createdAt | timestamp | yes | |
| updatedAt | timestamp | yes | |

### 5.5 orders

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | generated |
| customerId | uuid | yes | FK to customers |
| restaurantId | uuid | yes | FK to restaurants |
| status | string(20) | yes | one of: pending, confirmed, delivered, cancelled. Default pending |
| subtotalKobo | bigint | yes | computed at creation from the item prices |
| deliveryFeeKobo | bigint | yes | copied from the restaurant at creation time |
| totalKobo | bigint | yes | subtotal plus delivery fee |
| deliveryAddress | string(200) | yes | |
| createdAt | timestamp | yes | filterable and sortable |
| updatedAt | timestamp | yes | |

### 5.6 order_items

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | generated |
| orderId | uuid | yes | FK to orders, cascade delete |
| menuItemId | uuid | yes | FK to menu_items |
| nameAtOrder | string(120) | yes | copied at creation |
| unitPriceKobo | bigint | yes | copied at creation |
| quantity | integer | yes | must be 1 or more |

### 5.7 Relationships

```
customers  1 ----< orders >---- 1  restaurants
                     |
                     1
                     |
                     ^
               order_items
                     v
                     |
                    many
                     |
               menu_items  >---- 1  restaurants
```

In words:

- A restaurant has many menu items. A menu item belongs to exactly one restaurant.
- A customer places many orders. An order belongs to exactly one customer.
- An order belongs to exactly one restaurant.
- An order contains many order items. Each order item points at one menu item.

### 5.8 Deliberate denormalisation

`order_items.nameAtOrder` and `order_items.unitPriceKobo` are copies of values that already live on `menu_items`, and `orders.deliveryFeeKobo` is a copy of a value on `restaurants`.

This is intentional. An order is a historical record of what was agreed. If a restaurant raises its prices next week, last week's order must not silently change value. The copy freezes the fact at the moment it mattered.

### 5.9 Indexes

| Index | Serves |
|---|---|
| restaurants(city, cuisine) | the main filtered list |
| restaurants(rating desc, id) | rating sort with cursor |
| restaurants(delivery_fee_kobo, id) | fee sort with cursor |
| menu_items(restaurant_id, category) | the nested menu endpoint with a category filter |
| menu_items(price_kobo, id) | price sort with cursor |
| orders(customer_id, created_at desc) | a customer's order history |
| order_items(order_id) | loading an order with its items |

---

## 6. API contract

**Base path:** `/api/v1`

The `v1` segment is present from the first commit. A breaking change ships as `/api/v2` alongside `/api/v1`, so existing clients keep working while new ones migrate.

### 6.1 Success envelope

Every successful response uses one of exactly two shapes.

**Collection:**

```json
{
  "data": [ { "id": "...", "name": "..." } ],
  "meta": {
    "limit": 20,
    "total": 340,
    "hasMore": true,
    "nextCursor": "eyJ2IjoiNC41IiwiaWQiOiIwMWQuLi4ifQ"
  }
}
```

**Single item:**

```json
{
  "data": { "id": "...", "name": "..." },
  "meta": {}
}
```

`meta` is always present, even when empty. Clients should never have to branch on its absence.

### 6.2 Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "quantity must be 1 or greater",
    "details": [ { "field": "items[0].quantity", "issue": "must be >= 1" } ]
  }
}
```

`details` is optional and only present for validation failures. The HTTP status code is always honest. The API never returns 200 with an error inside the body.

### 6.3 Error codes

| code | HTTP | When |
|---|---|---|
| BAD_REQUEST | 400 | Negative offset, unknown sort field, unknown order direction, malformed cursor, malformed UUID |
| NOT_FOUND | 404 | A well-formed id that matches no row, or an unknown path |
| VALIDATION_ERROR | 422 | Request body fails schema validation, with every failing field named |
| RATE_LIMITED | 429 | The caller exceeded the request budget |
| INTERNAL_ERROR | 500 | Unhandled. Should never be reachable by any documented input |

### 6.4 Endpoints

| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | /api/v1/restaurants | List restaurants | 200 |
| GET | /api/v1/restaurants/:id | One restaurant | 200 |
| GET | /api/v1/restaurants/:id/menu | That restaurant's menu items, paginated | 200 |
| GET | /api/v1/menu-items | List menu items across restaurants | 200 |
| GET | /api/v1/menu-items/:id | One menu item | 200 |
| GET | /api/v1/customers | List customers | 200 |
| GET | /api/v1/customers/:id | One customer | 200 |
| GET | /api/v1/customers/:id/orders | That customer's orders | 200 |
| POST | /api/v1/orders | Create an order | 201 |
| GET | /api/v1/orders | List orders | 200 |
| GET | /api/v1/orders/:id | One order, with its items | 200 |
| PATCH | /api/v1/orders/:id | Partial update, status and deliveryAddress only | 200 |
| DELETE | /api/v1/orders/:id | Remove an order | 204 |
| GET | /health | Liveness probe, unversioned, returns uptime | 200 |

### 6.5 List contract

Every list endpoint accepts the same core parameters.

| Parameter | Type | Default | Rules |
|---|---|---|---|
| limit | integer | 20 | Clamped to a maximum of 100. A request for 5000 returns 100, not an error |
| cursor | string | none | Opaque base64 token from a previous `meta.nextCursor`. Malformed returns 400 |
| sort | string | per endpoint | Must be on the endpoint's allowlist. Anything else returns 400 |
| order | string | desc | Must be `asc` or `desc`. Anything else returns 400 |

**Offset is also supported** as `offset`, for callers who need to jump pages. A negative offset returns 400. Cursor and offset are mutually exclusive, and sending both returns 400.

### 6.6 Per-endpoint filters and sorts

| Endpoint | Filters | Sort allowlist |
|---|---|---|
| /restaurants | `city`, `cuisine`, `isOpen`, `minRating`, `maxDeliveryFee` | `rating`, `deliveryFeeKobo`, `createdAt`, `name` |
| /restaurants/:id/menu | `category`, `isAvailable`, `minPrice`, `maxPrice` | `priceKobo`, `name`, `createdAt` |
| /menu-items | `category`, `restaurantId`, `minPrice`, `maxPrice` | `priceKobo`, `name`, `createdAt` |
| /orders | `status`, `restaurantId`, `customerId` | `createdAt`, `totalKobo` |
| /customers | `city` | `createdAt`, `fullName` |

Filters combine with AND. All price filters are in kobo.

### 6.7 POST /api/v1/orders

**Request:**

```json
{
  "customerId": "uuid, required",
  "restaurantId": "uuid, required",
  "deliveryAddress": "string, required, 5 to 200 chars",
  "items": [
    { "menuItemId": "uuid, required", "quantity": "integer, required, >= 1" }
  ]
}
```

**Rules enforced at creation:**

1. `items` must contain at least one entry and at most 50.
2. Every `menuItemId` must exist, must belong to `restaurantId`, and must be available. A mismatch returns 422 naming the offending item.
3. `nameAtOrder` and `unitPriceKobo` are copied from the menu item, not accepted from the client. A client cannot set its own price.
4. `subtotalKobo`, `deliveryFeeKobo` and `totalKobo` are computed server side.
5. `status` is always `pending` at creation and cannot be set by the client.

**Responses:** 201 with the created order and its items, 422 on validation failure, 404 if the restaurant or customer does not exist.

### 6.8 PATCH /api/v1/orders/:id

Accepts only `status` and `deliveryAddress`. Any other field returns 422. Transitions are checked: `delivered` and `cancelled` are terminal, and moving out of them returns 422.

---

## 7. Configuration

Every tunable number lives in one config module read from environment variables, not inline in a handler.

| Key | Default | Meaning |
|---|---|---|
| PAGINATION_DEFAULT_LIMIT | 20 | Used when the caller sends no limit |
| PAGINATION_MAX_LIMIT | 100 | The hard ceiling |
| RATE_LIMIT_WINDOW_SECONDS | 60 | The window length |
| RATE_LIMIT_MAX_REQUESTS | 100 | Requests allowed per IP per window |
| DATABASE_URL | none | Required, no default |
| PORT | 3000 | |
| NODE_ENV | development | |
| SEED_RESTAURANTS | 300 | Seed volume |
| SEED_MENU_ITEMS_PER_RESTAURANT | 12 | Seed volume |
| SEED_CUSTOMERS | 400 | Seed volume |
| SEED_ORDERS | 500 | Seed volume |

`.env.example` lists every key above with a safe placeholder. `.env` is git-ignored and verified absent by opening the repository in a private browser window.

---

## 8. Validation

A single schema validator (Zod or equivalent) validates request bodies, path parameters and query strings. Validation happens in one middleware layer so no handler contains ad hoc checking.

Required behaviour, each covered by a test:

| Input | Expected |
|---|---|
| `?limit=5000` | 200, silently clamped to 100 |
| `?limit=0` or `?limit=-3` | 400 BAD_REQUEST |
| `?offset=-1` | 400 BAD_REQUEST |
| `?sort=banana` | 400 BAD_REQUEST, listing the allowed fields |
| `?order=sideways` | 400 BAD_REQUEST |
| `/restaurants/not-a-uuid` | 400 BAD_REQUEST |
| `/restaurants/<valid uuid, no row>` | 404 NOT_FOUND |
| POST /orders with no `deliveryAddress` | 422 VALIDATION_ERROR naming `deliveryAddress` |
| POST /orders with `quantity: 0` | 422 VALIDATION_ERROR naming `items[n].quantity` |
| POST /orders with a menu item from another restaurant | 422 VALIDATION_ERROR naming the item |
| Any unknown path | 404 NOT_FOUND in the standard error envelope |

No documented input may produce a 500.

---

## 9. Rate limiting

- Keyed on client IP, read from the trusted proxy header the host sets.
- `RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW_SECONDS`, both from config.
- On exceed: HTTP 429, `code: RATE_LIMITED`, and a `Retry-After` header in seconds.
- Response headers on every request: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- `/health` is exempt so uptime checks do not consume budget.

---

## 10. Seed script

A single committed script, runnable as `npm run seed`, that fills the database using `@faker-js/faker`.

Requirements:

- Volumes come from config. Defaults give roughly 300 restaurants, 3600 menu items, 400 customers and 500 orders.
- **Idempotent.** Running it twice does not duplicate. Achieved by seeding from a fixed Faker seed value and upserting on natural unique keys (`restaurants.slug`, `customers.email`). A `--fresh` flag truncates first for a deliberate reset.
- Relationships are real: every menu item belongs to a seeded restaurant, every order references a seeded customer and restaurant, and every order item references a menu item from that same restaurant.
- Data is plausible: prices in sensible ranges, ratings clustered realistically, order dates spread across the last 90 days so date sorting is meaningful.
- The script prints a summary of rows created per table.
- A database dump is never committed.

---

## 11. Consumer application

The smallest client that proves the API works from outside. One page, calling the deployed public URL. `localhost` must not appear anywhere in it.

**Must have:**

1. A list of restaurants rendered from `GET /api/v1/restaurants`
2. At least one filter control wired to a real query parameter, for example cuisine
3. A sort control wired to `sort` and `order`
4. A "next page" button that uses `meta.nextCursor` and disables itself when `hasMore` is false
5. A loading state
6. An **empty state** shown when a filter returns zero results
7. An **error state** shown when the API returns a non-2xx response, including a readable message when the response is 429

Items 6 and 7 are what separate a pass from an excellent grade. A client that only handles the happy path has not proved anything.

The base URL is read from an environment variable, not hardcoded.

---

## 12. Deployment

| Item | Decision |
|---|---|
| Host | Railway, Render, Fly or Vercel |
| Database | Managed Postgres provided by the host. No SQLite, no local database |
| Config | All environment variables set in the host dashboard, none committed |
| Seed | The seed script is run against the production database after first deploy |
| Verification | The API is called from a device that is not the development machine, for example a phone with wifi off, and the response is captured |

A deployment where the seed was never run is a failed deployment. The live API must return data.

---

## 13. Documentation requirements

The README is the API documentation and is graded as such. It contains, in order:

1. One-paragraph description of the market and the API
2. The live base URL
3. Quick start: clone, install, `.env` setup, migrate, seed, run
4. The resource table and relationship diagram from section 5
5. **Every endpoint**, each with: method, path, every query parameter with type and default, a copy-pasteable `curl` example, and an example response
6. The full error code table
7. The rate limit policy and its headers
8. A **Design decisions** section answering, in prose:
   - Why these resources and these relationships
   - Why generated identifiers rather than sequential integers
   - Why cursor pagination, what offset would cost, and when offset would be the better choice
   - What the envelope shape is and why it is identical on every endpoint
   - Why money is stored as integer minor units
   - Where the rate limit and pagination numbers live, and why they live there
9. The evidence section from section 15

Acceptance test for the README: a developer who has never spoken to the author makes a successful filtered, sorted, paginated call using only the README.

---

## 14. Acceptance criteria

The task is complete when every line below is true.

- [ ] Three or more resources exist and reference each other
- [ ] A nested endpoint demonstrates a relationship
- [ ] All identifiers are generated UUIDs, no sequential integers anywhere
- [ ] The seed script is committed, repeatable, and produces a few hundred records per resource
- [ ] Every path is prefixed `/api/v1`
- [ ] Every list endpoint supports pagination, at least two filters, and sorting
- [ ] Filters, sort and pagination work together in a single request
- [ ] The success envelope is identical across every endpoint
- [ ] The error envelope is identical across every endpoint
- [ ] 400, 404, 422 and 429 are all reachable and all correct
- [ ] No documented input produces a 500
- [ ] `limit` defaults to 20 and clamps at 100
- [ ] Rate limiting is active, returns 429, and sends `Retry-After`
- [ ] Rate limit and pagination numbers live in configuration
- [ ] The README documents every endpoint with curl examples
- [ ] The README has a Design decisions section
- [ ] The API is live on a public URL with a seeded managed Postgres
- [ ] The consumer calls the live URL and handles empty and error states
- [ ] `.env` is not committed, verified in a private browser window
- [ ] `.env.example` is present and complete
- [ ] The commit history is incremental
- [ ] Nothing outside this brief was built

---

## 15. Evidence to capture

| # | Evidence | How to capture it |
|---|---|---|
| 1 | The live API URL | Written at the top of the README |
| 2 | A paginated response from the live URL | Terminal screenshot of `curl "https://<url>/api/v1/restaurants?limit=5&sort=rating&order=desc"` showing both `data` and `meta` |
| 3 | The 429 response | Screenshot after a loop such as `for i in $(seq 1 120); do curl -s -o /dev/null -w "%{http_code}\n" <url>/api/v1/restaurants; done`, showing 200s turning into 429s, plus the `Retry-After` header |
| 4 | The consumer working | Screenshot of the page showing live data, plus one of the empty state after a filter with no matches |
| 5 | The seed script | Committed file, linked in the README, with its terminal output showing row counts |

Every screenshot must be readable at normal zoom and stored in the repository, for example under `docs/evidence/`.

---

## 16. Defence preparation

These four questions will be asked. Written answers belong in the Design decisions section.

**1. Why cursor or offset pagination, and when is the other better?**
Cursor pagination is stable under writes. With offset, a row inserted while a caller pages through causes an item to be skipped or repeated. Cursor also stays fast at depth, because the database seeks directly rather than counting and discarding rows. Offset is better when the caller needs to jump to an arbitrary page number, or needs a page count in the interface, because a cursor cannot express "page 7". This API offers both, and documents cursor as the default.

**2. What happens on page 50 of a 30-page resource?**
With offset, the request is valid and returns an empty `data` array, `hasMore: false`, and the real `total`. It is not an error, because asking for a page beyond the end is a legitimate question with a legitimate answer. With a cursor, `hasMore: false` means no further cursor is issued, so the situation cannot arise.

**3. Where does the rate limit number live and why?**
In the config module, sourced from `RATE_LIMIT_MAX_REQUESTS`. It lives there so the value can change per environment and be tuned in production without a code change or redeploy of logic, and so there is exactly one place to look when the number is questioned.

**4. How do you add a field to the restaurant resource without breaking clients?**
Adding an optional field is backwards compatible and stays inside v1. Existing clients ignore unknown keys. The migration adds the column as nullable or with a default, the field is added to responses, and the README documents it with the version it appeared in. What would require v2 is removing a field, renaming a field, changing a field's type, or changing the meaning of an existing value. Those go into `/api/v2` with `/api/v1` kept running during a documented deprecation window.

---

## 17. Traps to avoid

Taken directly from the brief and turned into checks:

| Trap | Guard |
|---|---|
| Sequential identifiers | UUID defaults on every table, verified in the migration |
| Returning the whole collection with no limit | Default limit applied in the query layer, not the handler, so no endpoint can skip it |
| Different response shapes on different endpoints | One shared response helper used by every handler |
| 200 with an error in the body | One shared error handler that sets the status from the error code |
| Deploying without seeding | Seed run recorded as a deployment step in the README |
| A consumer built against localhost | Base URL read from an environment variable, and the evidence screenshot shows the public host |

---

## 18. Milestones

| Phase | Work | Rough hours |
|---|---|---|
| 1 | Resource design, field tables, relationship diagram written into the README | 1.5 |
| 2 | Project setup, migrations, config module, `.env.example` | 1.5 |
| 3 | Seed script and verification that a rerun does not duplicate | 2 |
| 4 | Read endpoints, shared pagination, filtering and sorting layer | 3 |
| 5 | Write endpoints, validation schemas, error handler | 2.5 |
| 6 | Rate limiting, ugly-input pass, fix anything returning 500 | 1.5 |
| 7 | Deploy, run production seed, verify from an outside device | 1.5 |
| 8 | Consumer app including empty and error states | 2 |
| 9 | README, design decisions, evidence capture | 2 |
| 10 | The public post | 1 |

---

## 19. The post

One post, published, repository linked, containing at least one specific number, screenshot or behaviour.

It teaches one thing rather than announcing completion. Strongest candidates for this task:

- What the API does when someone asks for 5000 records, and why clamping is kinder than rejecting
- Why the `v1` was in the path on the very first commit
- What the seed script revealed about the relationships, specifically the moment order items had to start copying prices instead of pointing at them

Include the live URL and one `curl` command a reader can paste and run immediately.

---

## Appendix: swapping the market

If food delivery is not the chosen market, the structure holds with a direct substitution. Everything else in this document stays the same.

| Food delivery | E-commerce | Property | Transport |
|---|---|---|---|
| restaurants | stores | agents | operators |
| menu items | products | listings | routes |
| customers | customers | enquirers | passengers |
| orders | orders | viewings | bookings |
| order items | cart items | listing features | booking legs |
