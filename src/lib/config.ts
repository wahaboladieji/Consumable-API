/**
 * Central configuration module.
 * Governance: PRD §7, AGENTS.md §4, coding-standards.md rule 8.
 * This is the ONLY place process.env is read for application config.
 */

function parseEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export const config = {
  env: process.env.NODE_ENV || "development",
  port: parseEnvInt("PORT", 3000),
  databaseUrl: process.env.DATABASE_URL || "",
  
  pagination: {
    defaultLimit: parseEnvInt("PAGINATION_DEFAULT_LIMIT", 20),
    maxLimit: parseEnvInt("PAGINATION_MAX_LIMIT", 100),
  },

  rateLimit: {
    windowSeconds: parseEnvInt("RATE_LIMIT_WINDOW_SECONDS", 60),
    maxRequests: parseEnvInt("RATE_LIMIT_MAX_REQUESTS", 90),
  },

  seed: {
    restaurants: parseEnvInt("SEED_RESTAURANTS", 300),
    menuItemsPerRestaurant: parseEnvInt("SEED_MENU_ITEMS_PER_RESTAURANT", 12),
    customers: parseEnvInt("SEED_CUSTOMERS", 400),
    orders: parseEnvInt("SEED_ORDERS", 500),
  },

  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000",
} as const;
