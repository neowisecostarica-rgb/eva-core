import pkg from "pg";

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not defined");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

/*
====================================================
CONNECTION LOG (DEBUG)
====================================================
*/

pool.on("connect", () => {
  console.log("PostgreSQL connected");
  console.log("🧪 DATABASE_URL:", process.env.DATABASE_URL);
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error", err);
});

export default pool;
