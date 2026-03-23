/*
====================================================
EVA AUTH MIDDLEWARE (MULTI-TENANT SECURE)
====================================================
*/

import pool from "../db.js";

/*
====================================================
HELPER: GET API KEY FROM REQUEST
====================================================
*/

function getApiKey(req) {
  return (
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    null
  );
}

/*
====================================================
AUTH MIDDLEWARE
====================================================
*/

export async function authenticate(req, res, next) {
  try {
    const apiKey = getApiKey(req);

    if (!apiKey) {
      console.error("❌ Missing API Key");
      return res.status(401).json({
        error: "Missing API Key"
      });
    }

    /*
    =====================================
    VALIDATE API KEY IN DB
    =====================================
    */

    const { rows } = await pool.query(
      `
      SELECT id, name
      FROM organizations
      WHERE api_key = $1
      LIMIT 1
      `,
      [apiKey]
    );

    if (rows.length === 0) {
      console.error("❌ Invalid API Key");
      return res.status(403).json({
        error: "Invalid API Key"
      });
    }

    const org = rows[0];

    /*
    =====================================
    ATTACH TO REQUEST
    =====================================
    */

    req.organization = {
      id: org.id,
      name: org.name
    };

    console.log("🔐 AUTH OK:", org.id);

    next();

  } catch (error) {
    console.error("❌ AUTH ERROR:", error);

    return res.status(500).json({
      error: "Auth internal error"
    });
  }
}
