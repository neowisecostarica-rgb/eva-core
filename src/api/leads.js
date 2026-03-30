import { authenticate } from "../lib/auth.js";

export function registerLeadRoutes(app, pool) {

  function getOrg(req) {
    if (!req.organization_id) {
      throw new Error("organization_id missing in request");
    }
    return req.organization_id;
  }

  /*
  ====================================================
  GET /v1/leads
  ====================================================
  */

  app.get("/v1/leads", authenticate, async (req, res) => {
    try {
      const organization_id = getOrg(req);

      const r = await pool.query(`
        SELECT
          id,
          phone,
          lead_score,
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

      res.json({
        success: true,
        data: r.rows
      });

    } catch (err) {
      console.error("❌ leads list error:", err);
      res.status(500).json({ success: false });
    }
  });

  /*
  ====================================================
  PATCH /v1/leads/:id
  ====================================================
  */

  app.patch("/v1/leads/:id", authenticate, async (req, res) => {
    try {
      const organization_id = getOrg(req);
      const { id } = req.params;

      const {
        stage,
        status,
        lead_score,
        phone
      } = req.body;

      // 🔒 Validar que el lead existe y pertenece al tenant
      const existing = await pool.query(`
        SELECT id
        FROM leads
        WHERE id = $1
        AND organization_id = $2
        LIMIT 1
      `, [id, organization_id]);

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Lead not found"
        });
      }

      // 🔧 Construcción dinámica (solo campos enviados)
      const fields = [];
      const values = [];
      let index = 1;

      if (stage !== undefined) {
        fields.push(`stage = $${index++}`);
        values.push(stage);
      }

      if (status !== undefined) {
        fields.push(`status = $${index++}`);
        values.push(status);
      }

      if (lead_score !== undefined) {
        fields.push(`lead_score = $${index++}`);
        values.push(lead_score);
      }

      if (phone !== undefined) {
        fields.push(`phone = $${index++}`);
        values.push(phone);
      }

      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update"
        });
      }

      values.push(id);
      values.push(organization_id);

      const query = `
        UPDATE leads
        SET
          ${fields.join(", ")},
          updated_at = NOW()
        WHERE id = $${index++}
        AND organization_id = $${index}
        RETURNING *
      `;

      const r = await pool.query(query, values);

      res.json({
        success: true,
        data: r.rows[0]
      });

    } catch (err) {
      console.error("❌ lead update error:", err);
      res.status(500).json({ success: false });
    }
  });

}
