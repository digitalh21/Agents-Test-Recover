import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * PostgreSQL connection — Supabase in production, local Postgres in sandbox.
 * Priority: SUPABASE_DB_URL → POSTGRES_URL → DATABASE_URL.
 * All lead operations, call logs, agent profiles, commission ledgers,
 * tickets, banners/broadcasts and audit trails read/write through this pool.
 */
const databaseUrl =
  process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("SUPABASE_DB_URL / POSTGRES_URL / DATABASE_URL is required");
}

let poolConfig: any = {};

try {
  // Safe URL parsing for percent-encoded passwords, special hosts, query params
  const parsedUrl = new URL(databaseUrl);
  poolConfig = {
    user: parsedUrl.username ? decodeURIComponent(parsedUrl.username) : undefined,
    password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined,
    host: parsedUrl.hostname,
    port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 5432,
    database: parsedUrl.pathname ? parsedUrl.pathname.substring(1) : undefined,
  };
  
  // Handlers for query parameters in connection string (e.g. sslmode)
  const sslMode = parsedUrl.searchParams.get("sslmode");
  if (
    sslMode === "require" ||
    sslMode === "prefer" ||
    databaseUrl.includes("supabase") ||
    databaseUrl.includes("pooler") ||
    databaseUrl.includes("aws-0-ap-southeast-1")
  ) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
} catch (e) {
  // Fallback to connectionString if URL parsing fails
  poolConfig = {
    connectionString: databaseUrl,
  };
}

// Add timeout and max pool size configuration
poolConfig.max = 10;
poolConfig.idleTimeoutMillis = 30000;
poolConfig.connectionTimeoutMillis = 10000;

// Force SSL if it is a Supabase or pooler host
if (
  databaseUrl.includes("supabase") ||
  databaseUrl.includes("pooler") ||
  databaseUrl.includes("aws-0-ap-southeast-1") ||
  databaseUrl.includes("sslmode=require")
) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ?? new Pool(poolConfig);

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
