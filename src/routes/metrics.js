/*
====================================================
EVA METRICS ROUTES
====================================================
*/

import express from "express";
import pool from "../db.js";

const router = express.Router();

/*
====================================================
HELPERS
====================================================
*/

function safeNumber(value) {
  return Number(value || 0);
}

function buildRadarRecommendation({
  estudio = 0,
  trabajo = 0,
  buyIntent = 0,
  priceObjections = 0,
  lowPriceSearch = 0
}) {
  let dominantSegment = "general";
  let mainBlocker = "none";
  let demandLevel = "low";
  let recommendation = "Seguir recolectando más datos antes de tomar decisiones fuertes.";

  if (estudio > trabajo && estudio > 0) {
    dominantSegment = "estudio";
  } else if (trabajo > estudio && trabajo > 0) {
    dominantSegment = "trabajo";
  }

  if (priceObjections > 0 || lowPriceSearch > 0) {
    mainBlocker = "price";
  }

  if (buyIntent >= 15) {
    demandLevel = "high";
  } else if (buyIntent >= 5) {
    demandLevel = "medium";
  }

  if (dominantSegment === "estudio" && mainBlocker === "price") {
    recommendation =
      "Hay demanda en laptops para estudio, pero el precio está frenando cierres. Conviene anunciar opciones de entrada o destacar financiamiento/apartado.";
  } else if (dominantSegment === "estudio") {
    recommendation =
      "La demanda principal viene de clientes de estudio. Conviene priorizar anuncios y contenido para laptops de estudio.";
  } else if (dominantSegment === "trabajo" && mainBlocker === "price") {
    recommendation =
      "Hay demanda en laptops para trabajo, pero la objeción de precio aparece con frecuencia. Conviene reforzar valor, garantía y durabilidad.";
  } else if (dominantSegment === "trabajo") {
    recommendation =
      "La demanda principal viene de clientes de trabajo. Conviene priorizar equipos empresariales y mensajes de productividad.";
  } else if (mainBlocker === "price") {
    recommendation =
      "La objeción de precio aparece con frecuencia. Conviene crear oferta de entrada, destacar garantía o mostrar opciones más accesibles.";
  } else if (demandLevel === "high") {
    recommendation =
      "La intención de compra es alta. Conviene empujar cierres, apartados y seguimiento agresivo.";
  }

  return {
    dominant_segment: dominantSegment,
    main_blocker: mainBlocker,
    demand_level: demandLevel,
    recommendation
  };
}

/*
====================================================
SUMMARY METRICS
====================================================
*/

router.get("/summary", async (req, res) => {
  try {
    const { organization_id } = req.query;

    if (!organization_id) {
      return res.status(400).json({
        error: "organization_id required"
      });
    }

    const leadsResult = await pool.query(
      `
      SELECT COUNT(*) AS total_leads
      FROM leads
      WHERE organization_id = $1
    `,
      [organization_id]
    );

    const highIntentResult = await pool.query(
      `
      SELECT COUNT(*) AS high_intent
      FROM sales_intelligence_events
      WHERE organization_id = $1
      AND event_type = 'BUY_INTENT'
    `,
      [organization_id]
    );

    const priceResult = await pool.query(
      `
      SELECT COUNT(*) AS price_objections
      FROM sales_intelligence_events
      WHERE organization_id = $1
      AND event_type = 'PRICE_OBJECTION'
    `,
      [organization_id]
    );

    const useCaseResult = await pool.query(
      `
      SELECT event_type, COUNT(*) as count
      FROM sales_intelligence_events
      WHERE organization_id = $1
      AND event_type IN ('USE_CASE_ESTUDIO', 'USE_CASE_TRABAJO')
      GROUP BY event_type
    `,
      [organization_id]
    );

    const lowPriceResult = await pool.query(
      `
      SELECT COUNT(*) AS low_price_search
      FROM sales_intelligence_events
      WHERE organization_id = $1
      AND event_type = 'LOW_PRICE_SEARCH'
    `,
      [organization_id]
    );

    return res.json({
      success: true,
      data: {
        total_leads: safeNumber(leadsResult.rows[0]?.total_leads),
        high_intent: safeNumber(highIntentResult.rows[0]?.high_intent),
        price_objections: safeNumber(priceResult.rows[0]?.price_objections),
        low_price_search: safeNumber(lowPriceResult.rows[0]?.low_price_search),
        use_cases: useCaseResult.rows || []
      }
    });
  } catch (err) {
    console.error("❌ metrics summary error:", err.message);

    return res.status(500).json({
      error: "metrics failed"
    });
  }
});

/*
====================================================
MARKET RADAR
====================================================
*/

router.get("/radar", async (req, res) => {
  try {
    const { organization_id } = req.query;

    if (!organization_id) {
      return res.status(400).json({
        error: "organization_id required"
      });
    }

    const signalsResult = await pool.query(
      `
      SELECT event_type, COUNT(*) AS count
      FROM sales_intelligence_events
      WHERE organization_id = $1
      GROUP BY event_type
    `,
      [organization_id]
    );

    const counts = {};
    for (const row of signalsResult.rows) {
      counts[row.event_type] = safeNumber(row.count);
    }

    const estudio = counts.USE_CASE_ESTUDIO || 0;
    const trabajo = counts.USE_CASE_TRABAJO || 0;
    const buyIntent = counts.BUY_INTENT || 0;
    const priceObjections = counts.PRICE_OBJECTION || 0;
    const lowPriceSearch = counts.LOW_PRICE_SEARCH || 0;
    const productSearch = counts.PRODUCT_SEARCH || 0;
    const budgetDetected = counts.BUDGET_DETECTED || 0;

    const radar = buildRadarRecommendation({
      estudio,
      trabajo,
      buyIntent,
      priceObjections,
      lowPriceSearch
    });

    return res.json({
      success: true,
      data: {
        signals: {
          use_case_estudio: estudio,
          use_case_trabajo: trabajo,
          buy_intent: buyIntent,
          price_objections: priceObjections,
          low_price_search: lowPriceSearch,
          product_search: productSearch,
          budget_detected: budgetDetected
        },
        radar
      }
    });
  } catch (err) {
    console.error("❌ metrics radar error:", err.message);

    return res.status(500).json({
      error: "market radar failed"
    });
  }
});

export default router;
