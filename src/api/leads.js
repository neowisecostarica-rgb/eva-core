// src/api/leads.js

export function registerLeadRoutes(app, pool) {

  app.get("/v1/leads", async (req, res) => {

    try {

      const r = await pool.query(`
        SELECT
          cp.id,
          cp.external_user_id,
          cp.profile_json,
          cp.updated_at
        FROM customer_profiles cp
        ORDER BY cp.updated_at DESC
        LIMIT 100
      `);

      const leads = r.rows.map(row => {

        const p = row.profile_json || {};

        return {
          id: row.id,
          phone: row.external_user_id,
          stage: p.stage || "DISCOVERY",
          budget_crc: p.budget_crc || null,
          product_interest: p.product_interest || null,
          use_case: p.use_case || null,
          last_update: row.updated_at
        };

      });

      res.json(leads);

    } catch (err) {

      console.error(err);
      res.status(500).json({ error: "server_error" });

    }

  });

}
