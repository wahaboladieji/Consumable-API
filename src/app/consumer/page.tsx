"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Consumer Application Component
 * Governance: PRD §11, AGENTS.md §4.
 * Architecturally isolated client that calls the API over HTTP using fetch.
 */

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  cuisine: string;
  address: string;
  city: string;
  rating: number;
  deliveryFeeKobo: number;
  isOpen: boolean;
  createdAt: string;
}

interface ApiResponse<T> {
  data?: T;
  meta?: {
    limit: number;
    total?: number;
    hasMore: boolean;
    nextCursor?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Array<{ field: string; issue: string }>;
  };
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const CUISINES = [
  "All Cuisines",
  "Pizza",
  "Jollof & Grill",
  "Burgers & Wings",
  "Sushi & Asian",
  "Shawarma & Wraps",
  "Tacos & Mexican",
  "Bakery & Desserts",
  "African Delights",
];

const CITIES = ["All Cities", "Lagos", "Abuja", "Ibadan", "Port Harcourt", "Enugu"];

export default function ConsumerPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [cuisine, setCuisine] = useState<string>("All Cuisines");
  const [city, setCity] = useState<string>("All Cities");
  const [sort, setSort] = useState<string>("rating");
  const [order, setOrder] = useState<string>("desc");
  const [cursor, setCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ code: string; message: string; status?: number } | null>(null);
  const [meta, setMeta] = useState<{ limit: number; hasMore: boolean; nextCursor?: string }>({
    limit: 20,
    hasMore: false,
  });

  const fetchRestaurants = useCallback(
    async (nextCursorToken?: string | null, append = false) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("limit", "12");
        params.set("sort", sort);
        params.set("order", order);

        if (cuisine !== "All Cuisines") params.set("cuisine", cuisine);
        if (city !== "All Cities") params.set("city", city);
        if (nextCursorToken) params.set("cursor", nextCursorToken);

        const res = await fetch(`${API_BASE_URL}/api/v1/restaurants?${params.toString()}`);
        const body: ApiResponse<Restaurant[]> = await res.json();

        if (!res.ok || body.error) {
          setError({
            code: body.error?.code || `HTTP_${res.status}`,
            message: body.error?.message || "An unexpected error occurred while fetching restaurants.",
            status: res.status,
          });
          setRestaurants([]);
          return;
        }

        const newItems = body.data || [];
        setRestaurants((prev) => (append ? [...prev, ...newItems] : newItems));
        setMeta({
          limit: body.meta?.limit || 12,
          hasMore: body.meta?.hasMore || false,
          nextCursor: body.meta?.nextCursor,
        });
      } catch (err: any) {
        setError({
          code: "NETWORK_ERROR",
          message: err.message || "Failed to connect to the food delivery API service.",
        });
        setRestaurants([]);
      } finally {
        setLoading(false);
      }
    },
    [cuisine, city, sort, order]
  );

  // Re-fetch when filters or sort change
  useEffect(() => {
    setCursor(null);
    fetchRestaurants(null, false);
  }, [fetchRestaurants]);

  const handleNextPage = () => {
    if (meta.nextCursor && meta.hasMore) {
      setCursor(meta.nextCursor);
      fetchRestaurants(meta.nextCursor, true);
    }
  };

  const handleResetFilters = () => {
    setCuisine("All Cuisines");
    setCity("All Cities");
    setSort("rating");
    setOrder("desc");
  };

  const formatCurrency = (kobo: number) => {
    const naira = kobo / 100;
    return `₦${naira.toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
  };

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <span className="header-badge">Public REST API Demo</span>
        <h1 className="header-title">Food Delivery Explorer</h1>
        <p className="header-subtitle">
          Consuming live data from <code style={{ color: "#f97316" }}>/api/v1/restaurants</code>
        </p>
      </header>

      {/* Filter and Sort Controls */}
      <div className="controls-bar">
        <div className="control-group">
          <select
            className="select-control"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            aria-label="Filter by Cuisine"
          >
            {CUISINES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="select-control"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label="Filter by City"
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>Sort:</label>
          <select
            className="select-control"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort Field"
          >
            <option value="rating">Rating</option>
            <option value="deliveryFeeKobo">Delivery Fee</option>
            <option value="name">Name</option>
            <option value="createdAt">Date Created</option>
          </select>

          <select
            className="select-control"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            aria-label="Sort Direction"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="state-banner error-banner">
          <div className="state-icon">⚠️</div>
          <h2 className="state-title error-title">
            [{error.code}] {error.status === 429 ? "Rate Limit Exceeded" : "API Request Failed"}
          </h2>
          <p className="state-desc">{error.message}</p>
          <button className="btn-primary" onClick={() => fetchRestaurants(cursor, false)}>
            🔄 Retry Request
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && restaurants.length === 0 && (
        <div className="state-banner">
          <div className="state-icon">🍽️</div>
          <h2 className="state-title">No Restaurants Found</h2>
          <p className="state-desc">
            No restaurants match your selected filter parameters. Try clearing your filters or choosing a different city.
          </p>
          <button className="btn-primary" onClick={handleResetFilters}>
            Reset Filters
          </button>
        </div>
      )}

      {/* Grid of Restaurant Cards */}
      <div className="grid">
        {loading && restaurants.length === 0
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton skeleton-card" />)
          : restaurants.map((r) => (
              <div key={r.id} className="card">
                <div>
                  <div className="card-top">
                    <h3 className="card-title">{r.name}</h3>
                    <span className="rating-badge">★ {Number(r.rating).toFixed(1)}</span>
                  </div>

                  <div className="card-meta">
                    <div className="meta-row">
                      <span className="pill pill-cuisine">{r.cuisine}</span>
                      <span className={`pill ${r.isOpen ? "pill-open" : "pill-closed"}`}>
                        {r.isOpen ? "Open Now" : "Closed"}
                      </span>
                    </div>
                    <div className="meta-row">📍 {r.address}, {r.city}</div>
                  </div>
                </div>

                <div className="card-bottom">
                  <span>Delivery Fee</span>
                  <span className="fee-amount">{formatCurrency(Number(r.deliveryFeeKobo))}</span>
                </div>
              </div>
            ))}
      </div>

      {/* Pagination Footer */}
      {!error && (restaurants.length > 0 || meta.hasMore) && (
        <div className="pagination-bar">
          <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Showing <strong>{restaurants.length}</strong> restaurants
          </span>

          <button className="btn-primary" onClick={handleNextPage} disabled={!meta.hasMore || loading}>
            {loading ? "Loading..." : meta.hasMore ? "Next Page →" : "No More Results"}
          </button>
        </div>
      )}
    </div>
  );
}
