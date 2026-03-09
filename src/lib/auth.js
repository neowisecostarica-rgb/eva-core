import pool from "../db.js";

export async function authenticate(req, res, next) {

  try {

    // aceptar API key desde header o body
    const apiKey =
      req.headers["x-api-key"] ||
      req.headers["api-key"] ||
      req.body?.api_key ||
      req.query?.api_key;

    if (!apiKey) {
      return res.status(401).json({
        error: "missing_api_key"
      });
    }

    const result = await pool.query(
      `
      SELECT id, name
      FROM organizations
      WHERE api_key = $1
      LIMIT 1
      `,
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        error: "invalid_api_key"
      });
    }

    // adjuntar organization al request
    req.organization = result.rows[0];

    next();

  } catch (err) {

    console.error("auth error", err);

    res.status(500).json({
      error: "auth_failed"
    });

  }

}
