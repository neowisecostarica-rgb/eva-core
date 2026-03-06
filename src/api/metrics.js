// src/api/metrics.js

import { resolveOrganization } from "../lib/auth.js";

export function registerMetricsRoutes(app, pool) {

  app.get("/v1/metrics/summary", async (req, res) => {

    try {

      let orgId;

      try {
        orgId = await resolveOrganization(req);
      } catch (err) {
        return res.status(401).json({ error: "unauthorized" });
      }

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
