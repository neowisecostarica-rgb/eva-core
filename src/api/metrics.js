// src/api/metrics.js

export function registerMetricsRoutes(app, pool) {

  app.get("/v1/metrics/summary", async (req, res) => {

    try {

      const apiKey = req.headers.authorization?.replace("Bearer ", "");

      if (!apiKey) {
        return res.status(401).json({ error: "missing_api_key" });
      }

      const orgResult = await pool.query(
        `SELECT id 
         FROM organizations 
         WHERE api_key=$1 AND status='ACTIVE'
         LIMIT 1`,
        [apiKey]
      );

      if (!orgResult.rows.length) {
        return res.status(401).json({ error: "invalid_api_key" });
      }

      const orgId = orgResult.rows[0].id;

      const conversationsToday = await pool.query(
        `SELECT COUNT(*) 
         FROM conversations
         WHERE organization_id=$1
         AND created_at >= CURRENT_DATE`,
        [orgId]
      );

      const followupsPending = await pool.query(
        `SELECT COUNT(*)
         FROM followups
         WHERE organization_id=$1
         AND status='pending'`,
        [orgId]
      );

      const hotLeads = await pool.query(
        `SELECT COUNT(*)
         FROM customer_profiles
         WHERE organization_id=$1
         AND (profile_json->>'lead_score')::int >= 70`,
        [orgId]
      );

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
