// src/api/metrics.js

export function registerMetricsRoutes(app, pool) {

  app.get("/v1/metrics/summary", async (req, res) => {

    try {

      const conversationsToday = await pool.query(`
        SELECT COUNT(*) 
        FROM conversations
        WHERE created_at >= CURRENT_DATE
      `);

      const followupsPending = await pool.query(`
        SELECT COUNT(*)
        FROM followups
        WHERE status='pending'
      `);

      const hotLeads = await pool.query(`
        SELECT COUNT(*)
        FROM customer_profiles
        WHERE (profile_json->>'lead_score')::int >= 70
      `);

      const summary = {
        conversations_today: Number(conversationsToday.rows[0].count),
        followups_pending: Number(followupsPending.rows[0].count),
        hot_leads: Number(hotLeads.rows[0].count)
      };

      res.json(summary);

    } catch (err) {

      console.error(err);
      res.status(500).json({ error: "server_error" });

    }

  });

}
