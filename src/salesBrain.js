/*
====================================================
EVA CORE — SALES BRAIN
(BRAIN + CATALOG + LEAD INTELLIGENCE + BUSINESS GUARDS + PIPELINE SOLID)
====================================================
*/

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import db from "./db.js";

import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";

import { detectPipelineEvent } from "./brain/engines/pipelineEngine.js";
import { detectIntent } from "./brain/engines/intentEngine.js";

/*
====================================================
BRAIN HELPERS
====================================================
*/

function normalizeStage(stage) {
  const safeStage = String(stage || "new").toLowerCase();

  if (safeStage === "new" || safeStage === "early") return "new";
  if (safeStage === "qualifying") return "qualifying";
  if (safeStage === "consideration" || safeStage === "mid") return "consideration";
  if (safeStage === "hot" || safeStage === "ready_to_buy") return "hot";
  if (safeStage === "closing") return "closing";
  if (safeStage === "post") return "post";

  return "new";
}

function buildKnownData({ text, lead, history }) {
  return {
    last_message: text || "",
    lead_stage: lead?.stage || "new",
    history_count: Array.isArray(history) ? history.length : 0,
    has_history: Array.isArray(history) && history.length > 0,
  };
}

/*
====================================================
LEAD INTELLIGENCE
====================================================
*/

function extractLeadData(text = "") {
  const t = text.toLowerCase();

  let use_case = null;

  if (t.includes("estudio") || t.includes("colegio") || t.includes("universidad")) {
    use_case = "study";
  }

  if (t.includes("trabajo") || t.includes("oficina") || t.includes("empresa")) {
    use_case = "work";
  }

  if (t.includes("gaming") || t.includes("juegos") || t.includes("fortnite")) {
    use_case = "gaming";
  }

  return { use_case };
}

async function updateLeadIntelligence({ organization_id, lead_id, extracted }) {
  try {
    if (!lead_id || !extracted) return;

    const fields = [];
    const values = [];
    let idx = 1;

    if (extracted.use_case) {
      fields.push(`use_case = $${idx++}`);
      values.push(extracted.use_case);
    }

    if (fields.length === 0) return;

    values.push(lead_id);
    values.push(organization_id);

    const query = `
      UPDATE leads
      SET ${fields.join(", ")},
          updated_at = NOW()
      WHERE id = $${idx++}
      AND organization_id = $${idx}
    `;

    await db.query(query, values);

    console.log("🧠 Lead updated:", extracted);
  } catch (err) {
    console.warn("⚠️ Lead update error:", err);
  }
}

/*
====================================================
STRATEGY + CONTEXT
====================================================
*/

function decideStrategy({ intent, stage, known_data }) {
  const safeIntent = String(intent || "OTHER").toUpperCase();
  const safeStage = normalizeStage(stage);
  const data = known_data || {};

  if (safeIntent === "SERVICE") {
    if (!data.problem) return "ASK";
    return "EXPLAIN_CLOSE";
  }

  if (safeIntent === "BUY" || safeIntent === "CLOSE_INTENT") {
    if (safeStage === "new") return "QUALIFY";
    if (safeStage === "qualifying") return "QUALIFY";
    if (safeStage === "consideration") return "RECOMMEND";
    if (safeStage === "hot") return "CLOSE";
    if (safeStage === "closing") return "CLOSE";
    return "QUALIFY";
  }

  if (safeIntent === "FOLLOWUP") return "FOLLOWUP";
  if (safeIntent === "INFO") return "EXPLAIN";
  if (safeIntent === "GREETING") return "ASK";

  return "ASK";
}

function buildContext({
  organization_id,
  phone,
  text,
  intent,
  stage,
  strategy,
  history,
  known_data,
  config,
}) {
  return {
    organization_id,
    phone,
    text,
    intent,
    stage,
    strategy,
    history,
    known_data,
    config: config || null,
  };
}

/*
====================================================
CATALOG INTELLIGENCE
====================================================
*/

function decideCatalogUsage({ strategy, intent, stage }) {
  if (strategy === "RECOMMEND") return true;
  if (strategy === "CLOSE") return true;
  if (stage === "consideration" && intent === "BUY") return true;

  return false;
}

function filterCatalogResults(results = []) {
  if (!Array.isArray(results)) return [];

  const active = results.filter((p) => p?.is_active !== false);

  active.sort((a, b) => (b.score || 0) - (a.score || 0));

  return active;
}

/*
====================================================
BUSINESS GUARDS
====================================================
*/

function hasPriceSignal(text = "") {
  const t = text.toLowerCase();
  return (
    t.includes("precio") ||
    t.includes("cuánto cuesta") ||
    t.includes("cuanto cuesta") ||
    t.includes("vale") ||
    t.includes("cuánto") ||
    t.includes("cuanto")
  );
}

function hasServiceSignal(text = "") {
  const t = text.toLowerCase();
  return (
    t.includes("mantenimiento") ||
    t.includes("reparación") ||
    t.includes("reparacion") ||
    t.includes("no imprime") ||
    t.includes("falla") ||
    t.includes("problema") ||
    t.includes("daño") ||
    t.includes("daño")
  );
}

function hasActionClose(text = "") {
  const t = text.toLowerCase();
  return (
    t.includes("¿") ||
    t.includes("si gusta") ||
    t.includes("si desea") ||
    t.includes("coordinar") ||
    t.includes("traer el equipo") ||
    t.includes("traerlo") ||
    t.includes("se lo aparto") ||
    t.includes("le ayudo") ||
    t.includes("puede traer") ||
    t.includes("puedo enviarle")
  );
}

function sanitizeTechnicalLanguage(text = "") {
  let output = String(text || "");

  const replacements = [
    [/obstrucci[oó]n/gi, "bloqueo"],
    [/cabezal/gi, "sistema de impresión"],
    [/placa l[oó]gica/gi, "parte interna"],
    [/fuente de poder/gi, "parte de energía"],
    [/diagn[oó]stico t[eé]cnico/gi, "revisión"],
    [/mantenimiento preventivo/gi, "mantenimiento completo"],
    [/sulfataci[oó]n/gi, "daño interno"],
  ];

  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

function shortenIfNeeded(text = "", stage = "new") {
  const safeText = String(text || "").trim();
  const safeStage = normalizeStage(stage);

  if (!safeText) return safeText;
  if (safeStage !== "new" && safeStage !== "qualifying") return safeText;
  if (safeText.length <= 260) return safeText;

  const parts = safeText
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 2) {
    return safeText.slice(0, 260).trim();
  }

  return `${parts[0]} ${parts[1]}`.trim();
}

function enforceBusinessGuards({
  text,
  intent,
  stage,
  strategy,
  userText,
  known_data,
  safeCatalog,
}) {
  let output = String(text || "").trim();
  const incoming = String(userText || "");
  const safeStage = normalizeStage(stage);
  const safeIntent = String(intent || "OTHER").toUpperCase();
  const safeStrategy = String(strategy || "ASK").toUpperCase();
  const data = known_data || {};
  const hasCatalog = Array.isArray(safeCatalog) && safeCatalog.length > 0;
  const askingPrice = hasPriceSignal(incoming);
  const askingService = hasServiceSignal(incoming);

  if (!output) return output;

  output = sanitizeTechnicalLanguage(output);

  if (
    askingPrice &&
    !hasCatalog &&
    (safeStage === "new" || safeStage === "qualifying") &&
    safeIntent === "BUY"
  ) {
    return "Con mucho gusto le ayudo. Para orientarle mejor, ¿la necesita para estudio o trabajo y qué rango de presupuesto maneja más o menos?";
  }

  if (askingService && safeIntent === "SERVICE") {
    if (!data.problem) {
      return "Con mucho gusto le ayudo. ¿Me podría indicar la marca, el modelo y qué problema presenta el equipo?";
    }

    if (!hasActionClose(output)) {
      output = `${output} Si gusta, puede traer el equipo o le ayudo a coordinar la revisión.`;
    }

    output = shortenIfNeeded(output, safeStage);
    return output;
  }

  if ((safeStrategy === "RECOMMEND" || safeStrategy === "CLOSE") && !hasActionClose(output)) {
    if (hasCatalog) {
      output = `${output} Si gusta, le puedo enviar fotos reales o ayudarle a coordinar apartarlo.`;
    } else {
      output = `${output} Si gusta, le ayudo a avanzar con la mejor opción para usted.`;
    }
  }

  output = shortenIfNeeded(output, safeStage);

  if (
    (safeIntent === "GREETING" || safeStrategy === "ASK" || safeStrategy === "QUALIFY") &&
    !output.includes("?") &&
    !output.includes("¿")
  ) {
    output = `${output} ¿La necesita para estudio, trabajo o servicio técnico?`;
  }

  return output.trim();
}

/*
====================================================
PIPELINE SOLID
====================================================
*/

function getStageRank(stage) {
  const safeStage = normalizeStage(stage);

  if (safeStage === "new") return 1;
  if (safeStage === "qualifying") return 2;
  if (safeStage === "consideration") return 3;
  if (safeStage === "hot") return 4;
  if (safeStage === "closing") return 5;
  if (safeStage === "post") return 6;

  return 1;
}

function shouldAdvanceStage(currentStage, nextStage) {
  const current = normalizeStage(currentStage);
  const next = normalizeStage(nextStage);

  if (current === next) return false;

  return getStageRank(next) >= getStageRank(current);
}

function resolveNextStage({ currentStage, intent, pipelineEvent, strategy }) {
  const current = normalizeStage(currentStage);
  const safeIntent = String(intent || "OTHER").toUpperCase();
  const safeStrategy = String(strategy || "ASK").toUpperCase();
  const safeEvent = String(pipelineEvent || "").toUpperCase();

  if (safeEvent === "PAYMENT_INTENT") {
    return { nextStage: "closing", reason: "payment_intent", eventType: "PAYMENT_INTENT" };
  }

  if (safeEvent === "READY_TO_BUY") {
    return { nextStage: "hot", reason: "ready_to_buy", eventType: "READY_TO_BUY" };
  }

  if (safeEvent === "CATALOG_REQUEST") {
    return { nextStage: "consideration", reason: "catalog_request", eventType: "CATALOG_REQUEST" };
  }

  if (safeEvent === "PRICE_REQUEST") {
    return { nextStage: "qualifying", reason: "price_request", eventType: "PRICE_REQUEST" };
  }

  if (safeIntent === "GREETING" && current === "new") {
    return { nextStage: "new", reason: "greeting", eventType: "GREETING" };
  }

  if (safeIntent === "INFO" && current === "new") {
    return { nextStage: "qualifying", reason: "info_request", eventType: "INFO_REQUEST" };
  }

  if (safeIntent === "BUY" && current === "new") {
    return { nextStage: "qualifying", reason: "buy_intent", eventType: "BUY_INTENT" };
  }

  if (safeStrategy === "RECOMMEND" && current === "qualifying") {
    return { nextStage: "consideration", reason: "recommendation_phase", eventType: "STAGE_PROGRESS" };
  }

  if (safeStrategy === "CLOSE" && current === "consideration") {
    return { nextStage: "hot", reason: "closing_attempt", eventType: "STAGE_PROGRESS" };
  }

  if (safeStrategy === "CLOSE" && current === "hot") {
    return { nextStage: "closing", reason: "final_closing_attempt", eventType: "STAGE_PROGRESS" };
  }

  return {
    nextStage: current,
    reason: "no_stage_change",
    eventType: safeEvent || "NO_OP",
  };
}

async function registerPipelineTransition({
  organization_id,
  lead,
  conversation,
  phone,
  fromStage,
  toStage,
  reason,
  eventType,
  metadata,
}) {
  try {
    const safeFrom = normalizeStage(fromStage);
    const safeTo = normalizeStage(toStage);

    await db.query(
      `
      INSERT INTO pipeline_events (
        organization_id,
        lead_id,
        lead_phone,
        conversation_id,
        from_stage,
        to_stage,
        reason,
        event_type,
        event_data,
        metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        organization_id,
        lead?.id || null,
        phone || null,
        conversation?.id || null,
        safeFrom,
        safeTo,
        reason || null,
        eventType || "STAGE_PROGRESS",
        metadata || {},
        metadata || {},
      ]
    );

    console.log("📈 Pipeline event saved:", {
      from: safeFrom,
      to: safeTo,
      eventType,
      reason,
    });
  } catch (err) {
    console.warn("⚠️ Pipeline log error:", err);
  }
}

/*
====================================================
MAIN HANDLER
====================================================
*/

export async function handleInbound(payload) {
  try {
    const {
      organization_id,
      phone,
      text,
      channel,
      message_id,
    } = payload;

    console.log("🧠 [Brain] Processing:", { phone, text });

    /*
    ========================================
    0. IDEMPOTENCY
    ========================================
    */

    if (message_id) {
      const existing = await db.query(
        `SELECT id FROM messages
         WHERE organization_id = $1
         AND external_message_id = $2
         LIMIT 1`,
        [organization_id, message_id]
      );

      if (existing.rows.length > 0) {
        return {
          reply: { text: null, media: [] },
          meta: { duplicate: true },
        };
      }
    }

    /*
    ========================================
    1. LEAD + CONVERSATION
    ========================================
    */

    const lead = await findOrCreateLead({ organization_id, phone });

    const conversation = await findOrCreateConversation({
      organization_id,
      phone,
      channel,
    });

    /*
    ========================================
    2. SAVE USER MESSAGE
    ========================================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      text,
      message_id,
    });

    /*
    ========================================
    3. HISTORY
    ========================================
    */

    const historyRes = await db.query(
      `SELECT role, content AS text
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 10`,
      [conversation.id]
    );

    const history = historyRes.rows || [];

    /*
    ========================================
    4. INTENT + LEAD EXTRACTION
    ========================================
    */

    const intent = detectIntent(text);

    const extracted = extractLeadData(text);

    await updateLeadIntelligence({
      organization_id,
      lead_id: lead.id,
      extracted,
    });

    /*
    ========================================
    5. PRE-STRATEGY CONTEXT
    ========================================
    */

    const known_data = {
      ...buildKnownData({ text, lead, history }),
      use_case: extracted?.use_case || lead?.use_case || null,
    };

    const strategy = decideStrategy({
      intent,
      stage: lead.stage,
      known_data,
    });

    console.log("🧠 STRATEGY:", strategy);

    /*
    ========================================
    6. PIPELINE DETECTION + STAGE RESOLUTION
    ========================================
    */

    const pipelineEvent = detectPipelineEvent(text);

    const currentStage = normalizeStage(lead.stage);

    const transition = resolveNextStage({
      currentStage,
      intent,
      pipelineEvent,
      strategy,
    });

    let finalStage = currentStage;

    if (shouldAdvanceStage(currentStage, transition.nextStage)) {
      finalStage = normalizeStage(transition.nextStage);

      await db.query(
        `UPDATE leads
         SET stage = $1, updated_at = NOW()
         WHERE id = $2
         AND organization_id = $3`,
        [finalStage, lead.id, organization_id]
      );

      lead.stage = finalStage;

      await registerPipelineTransition({
        organization_id,
        lead,
        conversation,
        phone,
        fromStage: currentStage,
        toStage: finalStage,
        reason: transition.reason,
        eventType: transition.eventType,
        metadata: {
          text,
          intent,
          strategy,
          pipelineEvent,
        },
      });
    } else {
      lead.stage = currentStage;

      if (pipelineEvent) {
        await registerPipelineTransition({
          organization_id,
          lead,
          conversation,
          phone,
          fromStage: currentStage,
          toStage: currentStage,
          reason: transition.reason,
          eventType: transition.eventType,
          metadata: {
            text,
            intent,
            strategy,
            pipelineEvent,
          },
        });
      }
    }

    console.log("📍 Stage:", {
      from: currentStage,
      to: lead.stage,
      reason: transition.reason,
    });

    /*
    ========================================
    7. CONFIG
    ========================================
    */

    const config = await getPromptConfig(organization_id);

    /*
    ========================================
    8. CONTEXT
    ========================================
    */

    const context = buildContext({
      organization_id,
      phone,
      text,
      intent,
      stage: lead.stage,
      strategy,
      history,
      known_data: {
        ...known_data,
        current_stage: lead.stage,
      },
      config,
    });

    /*
    ========================================
    9. CATALOG
    ========================================
    */

    let safeCatalog = [];

    const shouldUseCatalog = decideCatalogUsage({
      strategy,
      intent,
      stage: lead.stage,
    });

    if (shouldUseCatalog) {
      try {
        const rawResults = await searchCatalogSmart({
          organization_id,
          query: text,
        });

        const filtered = filterCatalogResults(rawResults);

        safeCatalog = filtered.slice(0, 1);

        console.log("🛒 Catalog USED:", safeCatalog.length);
      } catch (err) {
        console.warn("⚠️ Catalog error:", err);
      }
    } else {
      console.log("🚫 Catalog SKIPPED");
    }

    /*
    ========================================
    10. AI
    ========================================
    */

    let aiText = null;

    try {
      const prompt = buildPrompt({
        context,
        catalogResults: safeCatalog,
        history,
        config,
        salesMode: strategy,
      });

      const aiResult = await runAI({ prompt });

      enforceAIRuntime({
        aiResponse: aiResult,
        source: "openai",
      });

      const guarded = applyAIGuards({
        aiResponse: aiResult,
        context,
      });

      if (guarded?.text) {
        aiText = guarded.text;
      }
    } catch (err) {
      console.warn("⚠️ AI error:", err);
    }

    /*
    ========================================
    11. FALLBACK
    ========================================
    */

    let replyText =
      aiText ||
      "Hola 😊 con mucho gusto le ayudo. ¿Qué tipo de uso le quiere dar al equipo?";

    /*
    ========================================
    12. BUSINESS GUARDS
    ========================================
    */

    replyText = enforceBusinessGuards({
      text: replyText,
      intent,
      stage: lead.stage,
      strategy,
      userText: text,
      known_data,
      safeCatalog,
    });

    console.log("🛡️ Guards applied");

    /*
    ========================================
    13. RESPONSE
    ========================================
    */

    const reply = generateReply({
      text: replyText,
      intent: "AI",
      products: aiText ? safeCatalog : [],
    });

    /*
    ========================================
    14. SAVE ASSISTANT MESSAGE
    ========================================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: reply.text,
    });

    return {
      reply,
      meta: {
        intent,
        stage: lead.stage,
        strategy,
        pipelineEvent,
        usedAI: !!aiText,
      },
    };
  } catch (err) {
    console.error("❌ SALES BRAIN ERROR:", err);

    return {
      reply: {
        text: "Hubo un problema procesando el mensaje, intentemos nuevamente 🙏",
        media: [],
      },
      meta: { error: true },
    };
  }
}
