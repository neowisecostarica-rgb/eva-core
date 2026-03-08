import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/summary", async (req, res) => {

  const result = await pool.query(
    `
    SELECT
      COUNT(*) AS total_messages
    FROM messages
    `
  );

  res.json({
    total_messages: result.rows[0].total_messages
  });

});

export default router;
