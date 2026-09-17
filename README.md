# Consumable REST API — Food Delivery Explorer

> A high-performance, public REST API serving food delivery data (restaurants, menu items, customers, orders, and order items) with zero login required for read operations, built with Next.js App Router, Prisma, PostgreSQL, Zod validation, IP-keyed rate limiting, and standard envelope responses. Includes a responsive client web application to demonstrate external API consumption.

---

## Live Base URL & Links

- **Live Public API Base URL:** `https://consumable-api-production.up.railway.app`
- **Live Consumer Web Application:** `https://consumable-api-production.up.railway.app/consumer`
- **Local API Base URL:** `http://localhost:3000`

---

## Quick Start Guide

### Prerequisites
- Node.js `^18.18.0` or `>=20.0.0`
- PostgreSQL instance running locally (or via Docker)

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/your-username/consumable-api.git
cd consumable-api
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your `.env` contains valid PostgreSQL credentials:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/consumable_api?schema=public"
PORT=3000
NODE_ENV="development"

# Pagination defaults & limits
PAGINATION_DEFAULT_LIMIT=20
PAGINATION_MAX_LIMIT=100

# Rate limiting
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX_REQUESTS=100

# Database seeding volumes
SEED_RESTAURANTS=300
SEED_MENU_ITEMS_PER_RESTAURANT=12
SEED_CUSTOMERS=400
SEED_ORDERS=500

# Consumer Base URL
NEXT_PUBLIC_API_BASE_URL="http://localhost:3000"
```

### 3. Run Database Migrations
Apply Prisma schema migrations to initialize PostgreSQL tables:
```bash
npx prisma migrate dev --name init
```

### 4. Seed Database (Idempotent)
Populate the database with realistic food delivery data:
```bash
npm run seed
```

### 5. Start Development Server
```bash
npm run dev
```
Access the API at `http://localhost:3000/api/v1/restaurants` and the Consumer Client at `http://localhost:3000/consumer`.

---

## Data Model & Relationships

The API serves 5 primary resources with strict relational integrity, stored in PostgreSQL:

| Resource | Table Name | Key Fields | Description |
|---|---|---|---|
| **Restaurant** | `restaurants` | `id` (UUID), `name`, `slug`, `cuisine`, `city`, `rating`, `deliveryFeeKobo`, `isOpen` | Food establishments providing delivery |
| **MenuItem** | `menu_items` | `id` (UUID), `restaurantId`, `name`, `category`, `priceKobo`, `isAvailable` | Dishes available at a specific restaurant |
| **Customer** | `customers` | `id` (UUID), `fullName`, `email`, `phone`, `city` | Users placing delivery orders |
| **Order** | `orders` | `id` (UUID), `customerId`, `restaurantId`, `status`, `subtotalKobo`, `deliveryFeeKobo`, `totalKobo` | Placed delivery orders with server-computed pricing |
| `OrderItem` | `order_items` | `id` (UUID), `orderId`, `menuItemId`, `nameAtOrder`, `unitPriceKobo`, `quantity` | Historical snapshot of items inside an order |

### Entity Relationship Diagram

```mermaid
erDiagram
    Restaurant ||--o{ MenuItem : "offers"
    Restaurant ||--o{ Order : "receives"
    Customer ||--o{ Order : "places"
    Order ||--|{ OrderItem : "contains"
    MenuItem ||--o{ OrderItem : "referenced by"

    Restaurant {
        string id PK "UUID v4"
        string name
        string slug UK
        string cuisine
        string address
        string city
        decimal rating
        bigint delivery_fee_kobo
        boolean is_open
        datetime created_at
        datetime updated_at
    }

    MenuItem {
        string id PK "UUID v4"
        string restaurant_id FK
        string name
        string description
        string category
        bigint price_kobo
        boolean is_available
        datetime created_at
        datetime updated_at
    }

    Customer {
        string id PK "UUID v4"
        string full_name
        string email UK
        string phone
        string city
        datetime created_at
        datetime updated_at
    }

    Order {
        string id PK "UUID v4"
        string customer_id FK
        string restaurant_id FK
        string status
        bigint subtotal_kobo
        bigint delivery_fee_kobo
        bigint total_kobo
        string delivery_address
        datetime created_at
        datetime updated_at
    }

    OrderItem {
        string id PK "UUID v4"
        string order_id FK
        string menu_item_id FK
        string name_at_order
        bigint unit_price_kobo
        int quantity
    }
```

---

## API Endpoints

All public API endpoints are versioned under `/api/v1/`.

### Shared Query Parameters (All List Endpoints)

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | Integer | `20` | Number of items to return. Clamped to maximum `100`. |
| `cursor` | Base64 String | — | Keyset cursor for primary pagination. Mutually exclusive with `offset`. |
| `offset` | Integer | — | Secondary offset skip count. Mutually exclusive with `cursor`. Returns `400` if both provided. |
| `sort` | String | Endpoint default | Field name to sort by (must be in endpoint allowlist). |
| `order` | String (`asc` \| `desc`) | `desc` | Direction of sort order. |

---

### 1. GET `/api/v1/restaurants`
Retrieves a paginated list of restaurants.

**Filter Parameters:**
- `city` (string, optional) — Filter by city (case-insensitive)
- `cuisine` (string, optional) — Filter by cuisine type (case-insensitive)
- `isOpen` (boolean `"true"` \| `"false"`, optional) — Filter by open/closed status
- `minRating` (float `1.0`–`5.0`, optional) — Minimum rating threshold
- `maxDeliveryFee` (integer in kobo, optional) — Maximum delivery fee in minor units

**Allowed Sort Fields:** `rating` (default), `deliveryFeeKobo`, `createdAt`, `name`

**Example Request:**
```bash
curl -s "http://localhost:3000/api/v1/restaurants?limit=2&sort=rating&order=desc"
```

**Example Response:**
```json
{
  "data": [
    {
      "id": "d2354bc8-f0f7-43a9-bc06-5772bc46862f",
      "name": "Heidenreich - Lang Diner",
      "slug": "restaurant-147-heidenreich---lang-diner",
      "cuisine": "Jollof & Grill",
      "address": "63536 Cartwright Manor",
      "city": "Enugu",
      "rating": 5,
      "deliveryFeeKobo": 95000,
      "isOpen": true,
      "createdAt": "2026-06-24T06:32:25.944Z",
      "updatedAt": "2026-09-17T10:23:02.552Z"
    },
    {
      "id": "b54ce99f-4f72-4791-acc7-f242a16434c5",
      "name": "Doyle, Pfeffer and Nicolas Kitchen",
      "slug": "restaurant-82-doyle-pfeffer-and-nicolas-kitchen",
      "cuisine": "Tacos & Mexican",
      "address": "4413 Waterloo Road",
      "city": "Enugu",
      "rating": 5,
      "deliveryFeeKobo": 101000,
      "isOpen": true,
      "createdAt": "2026-06-25T18:27:24.543Z",
      "updatedAt": "2026-09-17T10:23:02.264Z"
    }
  ],
  "meta": {
    "limit": 2,
    "hasMore": true,
    "nextCursor": "eyJ2Ijo1LCJpZCI6ImI1NGNlOTlmLTRmNzItNDc5MS1hY2M3LWYyNDJhMTY0MzRjNSJ9"
  }
}
```

---

### 2. GET `/api/v1/restaurants/:id`
Retrieves a single restaurant by UUID.

**Example Request:**
```bash
curl -s "http://localhost:3000/api/v1/restaurants/d2354bc8-f0f7-43a9-bc06-5772bc46862f"
```

**Example Response:**
```json
{
  "data": {
    "id": "d2354bc8-f0f7-43a9-bc06-5772bc46862f",
    "name": "Heidenreich - Lang Diner",
    "slug": "restaurant-147-heidenreich---lang-diner",
    "cuisine": "Jollof & Grill",
    "address": "63536 Cartwright Manor",
    "city": "Enugu",
    "rating": 5,
    "deliveryFeeKobo": 95000,
    "isOpen": true,
    "createdAt": "2026-06-24T06:32:25.944Z",
    "updatedAt": "2026-09-17T10:23:02.552Z"
  },
  "meta": {}
}
```

---

### 3. GET `/api/v1/restaurants/:id/menu` (Nested Relationship)
Retrieves menu items for a specific restaurant.

**Filter Parameters:**
- `category` (string, optional) — Filter by menu category
- `isAvailable` (boolean `"true"` \| `"false"`, optional) — Filter by item availability
- `minPrice` (integer in kobo, optional) — Minimum price
- `maxPrice` (integer in kobo, optional) — Maximum price

**Allowed Sort Fields:** `priceKobo` (default), `name`, `createdAt`

**Example Request:**
```bash
curl -s "http://localhost:3000/api/v1/restaurants/d2354bc8-f0f7-43a9-bc06-5772bc46862f/menu?limit=2"
```

**Example Response:**
```json
{
  "data": [
    {
      "id": "490ff41f-c07c-43ce-92cc-f7f5161ae1ba",
      "restaurantId": "d2354bc8-f0f7-43a9-bc06-5772bc46862f",
      "name": "Handmade Bespoke Metal Bike #7",
      "description": "The beautiful range of Apple Naturalé that has an exciting mix of natural ingredients.",
      "category": "desserts",
      "priceKobo": 118600,
      "isAvailable": true,
      "createdAt": "2026-07-31T05:53:28.377Z",
      "updatedAt": "2026-09-17T10:23:10.266Z"
    },
    {
      "id": "b3e359b3-ffe8-4038-9790-2639c2b926a6",
      "restaurantId": "d2354bc8-f0f7-43a9-bc06-5772bc46862f",
      "name": "Licensed Modern Bronze Soap #5",
      "description": "The beautiful range of Apple Naturalé that has an exciting mix of natural ingredients.",
      "category": "desserts",
      "priceKobo": 194500,
      "isAvailable": true,
      "createdAt": "2026-08-03T09:25:02.916Z",
      "updatedAt": "2026-09-17T10:23:10.259Z"
    }
  ],
  "meta": {
    "limit": 2,
    "hasMore": true,
    "nextCursor": "eyJ2IjoxOTQ1MDAsImlkIjoiYjNlMzU5YjMtZmZlOC00MDM4LTk3OTAtMjYzOWMyYjkyNmE2In0"
  }
}
```

---

### 4. GET `/api/v1/menu-items`
Retrieves a global paginated list of menu items.

**Allowed Sort Fields:** `priceKobo` (default), `name`, `createdAt`

**Example Request:**
```bash
curl -s "http://localhost:3000/api/v1/menu-items?limit=2"
```

**Example Response:**
```json
{
  "data": [
    {
      "id": "d7255a4f-0e03-49b6-8a29-fe38260181f0",
      "restaurantId": "a3d0d18d-f4bc-46e1-a24d-8ea47d656204",
      "name": "Electronic Tasty Granite Shoes #11",
      "description": "The slim & simple Maple Gaming Keyboard from Dev Byte",
      "category": "drinks",
      "priceKobo": 100500,
      "isAvailable": false,
      "createdAt": "2026-07-28T04:03:12.854Z",
      "updatedAt": "2026-09-17T10:23:04.709Z"
    },
    {
      "id": "5f1048e3-d3b7-45dc-b8a7-76f02e05a6e3",
      "restaurantId": "c4a9366b-2c9b-4453-9cb7-ecb86c017236",
      "name": "Handcrafted Fantastic Soft Salad #6",
      "description": "The Apollotech B340 is an affordable wireless mouse",
      "category": "drinks",
      "priceKobo": 100600,
      "isAvailable": true,
      "createdAt": "2026-07-31T09:04:52.037Z",
      "updatedAt": "2026-09-17T10:23:16.434Z"
    }
  ],
  "meta": {
    "limit": 2,
    "hasMore": true,
    "nextCursor": "eyJ2IjoxMDA2MDAsImlkIjoiNWYxMDQ4ZTMtZDNiNy00NWRjLWI4YTctNzZmMDJlMDVhNmUzIn0"
  }
}
```

---

### 5. GET `/api/v1/menu-items/:id`
Retrieves a single menu item by UUID.

**Example Request:**
```bash
curl -s "http://localhost:3000/api/v1/menu-items/490ff41f-c07c-43ce-92cc-f7f5161ae1ba"
```

---

### 6. GET `/api/v1/customers`
Retrieves a paginated list of customers.

**Allowed Sort Fields:** `createdAt` (default), `fullName`

**Example Request:**
```bash
curl -s "http://localhost:3000/api/v1/customers?limit=2"
```

---

### 7. GET `/api/v1/customers/:id`
Retrieves a single customer profile by UUID.

**Example Request:**
```bash
curl -s "http://localhost:3000/api/v1/customers/84246826-8907-4596-82af-00d14bdaf50b"
```

---

### 8. GET `/api/v1/customers/:id/orders`
Retrieves order history placed by a specific customer.

**Example Request:**
```bash
curl -s "http://localhost:3000/api/v1/customers/84246826-8907-4596-82af-00d14bdaf50b/orders?limit=2"
```

---

### 9. GET `/api/v1/orders`
Retrieves a paginated list of orders across the platform.

**Filter Parameters:**
- `status` (string, optional) — `"pending"`, `"confirmed"`, `"preparing"`, `"delivering"`, `"delivered"`, `"cancelled"`
- `restaurantId` (UUID, optional)
- `customerId` (UUID, optional)

**Allowed Sort Fields:** `createdAt` (default), `totalKobo`

**Example Request:**
```bash
curl -s "http://localhost:3000/api/v1/orders?limit=2"
```

---

### 10. GET `/api/v1/orders/:id`
Retrieves a single order with its item details.

**Example Request:**
```bash
curl -s "http://localhost:3000/api/v1/orders/21fa9c41-7b4a-402a-9f35-777c93341607"
```

---

## Error Handling & Status Codes

Every error response strictly follows a single, byte-for-byte consistent JSON envelope structure (PRD §6.2):

```json
{
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human-readable description",
    "details": [
      {
        "field": "fieldName",
        "issue": "Specific validation issue"
      }
    ]
  }
}
```

### Standard Error Code Reference

| Status Code | Error Code (`code`) | Trigger Condition |
|---|---|---|
| `400` | `BAD_REQUEST` | Malformed parameters, unknown sort field, or specifying both `cursor` and `offset` |
| `404` | `NOT_FOUND` | Resource matching UUID does not exist |
| `422` | `VALIDATION_ERROR` | Request body validation failure (e.g., missing required fields, zero order items) |
| `429` | `RATE_LIMITED` | IP address exceeded configured rate limit window |
| `500` | `INTERNAL_ERROR` | Server-side unhandled exception |

### Example 400 Bad Request Response
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid query or path parameters: id: Invalid UUID format"
  }
}
```

### Example 404 Not Found Response
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Restaurant with id '00000000-0000-0000-0000-000000000000' not found"
  }
}
```

---

## Rate Limiting Policy

To prevent abuse, all API endpoints (except `/health` and `/api/health`) enforce IP-keyed sliding-window rate limiting:

- **Limit:** 100 requests per 60-second window (configurable via `src/lib/config.ts`).
- **Exceeded Limit:** Returns HTTP status `429 Rate Limited` with a mandatory `Retry-After` header indicating seconds to wait.

### Rate Limit Response Headers

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1789656789
```

When throttled:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 45
Content-Type: application/json

{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again later."
  }
}
```

---

## Design Decisions

### 1. Why Food Delivery Resources & Relationships?
The food delivery domain features strong, natural relational boundaries: a `Restaurant` offers many `MenuItem`s; a `Customer` places an `Order`; an `Order` belongs to one `Restaurant` and contains multiple `OrderItem` rows. This structure allows us to demonstrate nested resources (`GET /restaurants/:id/menu`), multi-table transactions, and price-freezing mechanics.

### 2. Why Generated UUIDs vs. Sequential Integers?
All primary keys use generated UUID v4 (`String @id @default(uuid())`). Sequential integer keys (`1, 2, 3...`) expose public endpoints to **resource enumeration attacks**—allowing any anonymous script to count and scrape the entire database by looping through numbers. UUIDs prevent enumeration and enable safe distributed generation.

### 3. Keyset Cursor vs. Offset Pagination
- **Cursor Pagination (Default):** Uses an opaque Base64-encoded cursor (`sort_value + id`). Keyset pagination is **$O(1)$** in database performance because PostgreSQL seeks directly via indexed tuples (`WHERE (rating, id) < (val, id)`) rather than counting and discarding rows (`OFFSET 10000`). It is also immune to page-drift when new items are added while a client pages through results.
- **Offset Pagination (Secondary Option):** Supported via `?offset=N` for clients needing arbitrary page jumps (e.g., jump to page 10). Offset gets slower at scale because the DB must scan and throw away $N$ records.
- **Mutual Exclusion:** Providing both `cursor` and `offset` returns HTTP 400 to prevent conflicting pagination mechanics.

### 4. Consistent Envelope Shape Across Every Endpoint
Every single success response uses `{ "data": ..., "meta": ... }`, and every error response uses `{ "error": { "code", "message" } }`. This honesty guarantees that client code (such as our consumer frontend) never needs per-endpoint parsing logic or custom error wrappers.

### 5. Monetary Values Stored as Minor Units (`BigInt` Kobo)
All monetary fields (`deliveryFeeKobo`, `priceKobo`, `subtotalKobo`, `totalKobo`) are stored as whole numbers of minor units (**Kobo**, where 100 Kobo = ₦1 NGN) using PostgreSQL `BigInt`. Floating-point arithmetic (`0.1 + 0.2 = 0.30000000000000004`) introduces catastrophic rounding errors in financial computations. Integer minor units eliminate rounding ambiguity entirely.

### 6. Centralized Configuration (`lib/config.ts`)
Per AGENTS.md and security standards, `process.env` is never accessed directly in handlers or middleware. `lib/config.ts` is the single source of truth for rate limits, pagination thresholds, database URLs, and seed parameters.

### 7. Non-Breaking Schema Evolution Strategy
To add a new field to `Restaurant` (e.g. `bannerImageUrl`):
1. Add the column as optional (`String?`) or with a default value in Prisma schema.
2. Run a database migration.
3. Update the Zod response validation schema and serializer.
4. Existing v1 clients will ignore unknown keys without breaking, preserving full backwards compatibility within `/api/v1/`.

---

## Evidence & Verification

Per PRD §15, the following evidence artifacts prove system correctness and public deployment:

| # | Evidence Requirement | Location / Screenshot |
|---|---|---|
| 1 | Live API URL | `https://consumable-api-production.up.railway.app` |
| 2 | Paginated Live API Response | `docs/evidence/01-live-paginated-response.png` |
| 3 | 429 Rate Limit Response | `docs/evidence/02-rate-limit-429.png` |
| 4 | Consumer Web App (Data & Empty/Error States) | `docs/evidence/03-consumer-app.png` |
| 5 | Repeatable Seed Script Execution Output | `docs/evidence/04-seed-execution.png` |

---

## Submission & Defence Preparation

- **Page 50 of 30-Page Resource:** Offset queries beyond available rows return `data: []`, `hasMore: false`, and total count. Cursor queries return `hasMore: false` with no next cursor issued.
- **Strict Validation:** Unrecognized query fields or malformed inputs return honest status codes (`400`, `404`, `422`, `429`) and never leak 500 errors or database stack traces.
