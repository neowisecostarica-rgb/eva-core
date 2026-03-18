/*
====================================================
EVA SALES BRAIN (ORCHESTRATOR CLEAN + FOLLOWUPS)
====================================================
*/

import pool from "./db.js";

/*
ENGINES
*/
import { searchCatalog } from "./brain/commerce/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

/*
====================================================
NORMALIZATION
====================================================
*/

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/*
====================================================
INTENT
====================================================
*/

function detectIntent(text = "") {
  const t = normalizeText(text);

  if (t.includes("hola") || t.includes("buenas")) return "GREETING";

  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("vale")
  ) return "BUY";

  if (
    t.includes("tienen") ||
    t.includes("hay") ||
    t.includes("busco")
  ) return "PRODUCT_SEARCH";

  return "UNKNOWN";
}

/*
====================================================
INTEREST LEVEL
====================================================
*/

function detectInterestLevel(text = "") {
  const t = normalizeText(text);

  if (
    t.includes("quiero") ||
    t.includes("me interesa") ||
    t.includes("lo compro") ||
    t.includes("apartar")
  ) return "HIGH";

  return "LOW";
}

/*
====================================================
STAGE
====================================================
*/

function resolveStage({ intent, hasProducts }) {
  if (intent === "GREETING") return "new";
  if (hasProducts) return "catalog_shown";
  if (intent === "BUY") return "considering";
  return "new";
}

/*
====================================================
MAIN HANDLER
====================================================
*/

export async function handleInbound({
  organization_id,
  phone,
  text
}) {

  console.log("📩 INBOUND:", { phone, text });

  try {

    /*
    ====================================================
    CANCEL PENDING FOLLOWUPS (SI CLIENTE RESPONDE)
    ====================================================
    */

    try {
      await pool.query(
        `
        UPDATE followups
        SET status = 'CANCELLED',
            updated_at = NOW()
        WHERE organization_id = $1
        AND lead_phone = $2
        AND status = 'PENDING'
      `,
        [organization_id, phone]
      );
    } catch (err) {
      console.error("FOLLOWUP CANCEL ERROR", err.message);
    }

    /*
    ====================================================
    DETECCIÓN
    ====================================================
    */

    const intent = detectIntent(text);
    const interestLevel = detectInterestLevel(text);

    /*
    ====================================================
    CATÁLOGO
    ====================================================
    */

    let catalogMatches = [];

    try {
      catalogMatches = await searchCatalog({
        organization_id,
        text
      });
    } catch (err) {
      console.warn("⚠️ catalog failed:", err.message);
      catalogMatches = [];
    }

    /*
    ====================================================
    STAGE
    ====================================================
    */

    const stage = resolveStage({
      intent,
      hasProducts: catalogMatches.length > 0
    });

    /*
    ====================================================
    GENERAR RESPUESTA
    ====================================================
    */

    const reply = await generateReply({
      text,
      intent,
      stage,
      catalogMatches,
      interestLevel
    });

    /*
    ====================================================
    CREATE FOLLOWUP (ANTI DUPLICADOS)
    ====================================================
    */

    try {

      const shouldCreateFollowup =
        catalogMatches.length > 0 ||
        intent === "BUY";

      if (shouldCreateFollowup) {

        const existing = await pool.query(
          `
          SELECT id
          FROM followups
          WHERE organization_id = $1
          AND lead_phone = $2
          AND status = 'PENDING'
          LIMIT 1
        `,
          [organization_id, phone]
        );

        if (existing.rowCount === 0) {

          const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);

          await pool.query(
            `
            INSERT INTO followups (
              organization_id,
              lead_phone,
              reason,
              scheduled_for,
              status,
              attempt_count,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, 'PENDING', 0, NOW(), NOW())
          `,
            [
              organization_id,
              phone,
              "sales_followup",
              scheduledFor
            ]
          );

        }

      }

    } catch (err) {
      console.error("FOLLOWUP CREATE ERROR", err.message);
    }

    /*
    ====================================================
    RESPUESTA FINAL
    ====================================================
    */

    return {
      reply,
      meta: {
        intent,
        stage,
        products_found: catalogMatches.length
      }
    };

  } catch (err) {

    console.error("❌ salesBrain error:", err.message);

    return {
      reply: {
        text: "Hubo un problema 🙏 pero con gusto te ayudo.\n\n¿Buscas laptop para estudio o trabajo?",
        media: []
      },
      meta: {
        error: true
      }
    };

  }

}
