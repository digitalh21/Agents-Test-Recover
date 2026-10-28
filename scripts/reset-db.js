const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

let databaseUrl = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  try {
    const envPath = path.resolve(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.trim().startsWith("DATABASE_URL=")) {
          databaseUrl = line.split("DATABASE_URL=")[1].trim();
          break;
        }
      }
    }
  } catch (e) {
    console.error("Could not read .env file:", e);
  }
}

if (!databaseUrl) {
  console.error("No database URL provided");
  process.exit(1);
}

const isHosted = databaseUrl.includes("supabase") || databaseUrl.includes("pooler") || databaseUrl.includes("aws-0-ap-southeast-1");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isHosted ? { rejectUnauthorized: false } : undefined
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("Dropping public schema cascade...");
    await client.query("DROP SCHEMA public CASCADE;");
    console.log("Re-creating public schema...");
    await client.query("CREATE SCHEMA public;");
    
    try {
      await client.query("GRANT ALL ON SCHEMA public TO postgres;");
    } catch (e) {
      // Ignored if postgres role does not exist on target
    }
    
    try {
      await client.query("GRANT ALL ON SCHEMA public TO public;");
    } catch (e) {
      // Ignored if public role grants fail
    }
    
    console.log("Database reset successfully!");
  } catch (err) {
    console.error("Error resetting database:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
