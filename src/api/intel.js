// src/api/intel.js

export function registerIntelRoutes(app, pool) {

  app.get("/v1/conversations/:id/intel", async (req, res) => {

    try {

      const { id } = req.params;

      const conv = await pool.query(`
        SELECT external_user_id
        FROM conversations
        WHERE id=$1
      `, [id]);

      if (!conv.rows.length) {
        return res.status(404).json({ error: "conversation_not_found" });
      }

      const userId = conv.rows[0].external_user_id;

      const profile = await pool.query(`
        SELECT profile_json
        FROM customer_profiles
        WHERE external_user_id=$1
      `, [userId]);

      const p = profile.rows[0]?.profile_json || {};

      res.json({
        phone: userId,
        stage: p.stage || "DISCOVERY",
        lead_score: p.lead_score || 0,
        budget_crc: p.budget_crc || null,
        product_interest: p.product_interest || null,
        use_case: p.use_case || null
      });

    } catch (err) {

      console.error(err);
      res.status(500).json({ error: "server_error" });

    }

  });

}
