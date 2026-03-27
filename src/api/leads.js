// src/api/leads.js

export function registerLeadRoutes(app, pool) {

  app.get("/v1/leads", async (req, res) => {

    try {

      const organization_id = req.organization?.id;

      if (!organization_id) {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      const r = await pool.query(`
        SELECT
          id,
          phone,
          score,
          stage,
          status,
          last_contact_at,
          created_at,
          updated_at
        FROM leads
        WHERE organization_id = $1
        ORDER BY updated_at DESC
        LIMIT 100
      `, [organization_id]);

      res.json(r.rows);

    } catch (err) {

      console.error(err);
      res.status(500).json({ error: "server_error" });

    }

  });

}
