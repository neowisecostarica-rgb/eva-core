/*
====================================================
EVA CORE — SALES BRAIN (FINAL CONTROLLED VERSION)
SOURCE OF TRUTH — NO PATCH ZONE
====================================================
*/

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import db from "./db.js";

import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";

import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";

/*
====================================================
HELPERS — CORE LOGIC
====================================================
*/

function isUserQualified(text, history = []) {
  const t = (text || "").toLowerCase().trim();

  const genericInputs = [
    "trabajo",
    "estudio",
    "uso básico",
    "uso basico",
  ];

  // Caso 1: respuesta demasiado general
  if (genericInputs.includes(t)) return false;

  // Caso 2: si ya hay algo de conversación previa → asumimos avance
  if (history.length >= 2) return true;

  // Caso 3: texto con más contexto (heurística simple)
  if (t.length > 20) return true;

  return false;
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
      try {
        const existing = await db.query(
          `
          SELECT id
          FROM messages
          WHERE organization_id = $1
          AND external_message_id = $2
          LIMIT 1
          `,
          [organization_id, message_id]
        );

        if (existing.rows.length > 0) {
          console.log("⚠️ Duplicate message skipped:", message_id);

          return {
            reply: { text: null },
            meta: { duplicate: true },
          };
        }
      } catch (err) {
        console.warn("⚠️ Idempotency error:", err);
      }
    }

    /*
    ========================================
    1. LEAD
    ========================================
    */

    let lead = null;

    try {
      lead = await findOrCreateLead({
        organization_id,
        phone,
      });
    } catch (err) {
      console.error("❌ Lead error:", err);
    }

    /*
    ========================================
    2. CONVERSATION
    ========================================
    */

    let conversation = null;

    try {
      conversation = await findOrCreateConversation({
        organization_id,
        phone,
        channel,
        lead_id: lead?.id,
      });
    } catch (err) {
      console.error("❌ Conversation error:", err);
    }

    /*
    ========================================
    3. SAVE USER MESSAGE
    ========================================
    */

    if (conversation?.id) {
      await saveMessage({
        organization_id,
        conversation_id: conversation.id,
        lead_id: lead?.id,
        role: "user",
        text,
        message_id,
      });
    }

    /*
    ========================================
    4. HISTORY
    ========================================
    */

    let history = [];

    try {
      if (conversation?.id) {
        const result = await db.query(
          `
          SELECT role, content as text
          FROM messages
          WHERE conversation_id = $1
          AND organization_id = $2
          ORDER BY created_at ASC
          LIMIT 10
          `,
          [conversation.id, organization_id]
        );

        history = result.rows;
      }
    } catch (err) {
      console.warn("⚠️ History error:", err);
    }

    /*
========================================
5. SIGNALS (NEW)
========================================
*/

const signals = extractSignalsFromText(text);

/*
========================================
6. MEMORY (NEW)
========================================
*/

const memory = buildCustomerMemory({
  lead,
  signals,
  history,
});
    
    /*
    ========================================
    5. CONTEXT
    ========================================
    */

    const context = buildConversationContext({
  organization_id,
  phone,
  text,
  channel,
  message_id,
  lead,
  signals,
  salesMode, // importante: después lo movemos si es necesario
});

    /*
    ========================================
    6. CATÁLOGO
    ========================================
    */

    let catalogResults = [];

    try {
      catalogResults = await searchCatalogSmart({
        organization_id,
        query: text,
      });
    } catch (err) {
      console.warn("⚠️ Catalog error:", err);
    }

    /*
    ========================================
    7. QUALIFICATION (NEW CORE)
    ========================================
    */

    const qualified = isUserQualified(text, history);

    /*
    ========================================
    8. SALES MODE (REAL CONTROL)
    ========================================
    */

    const lower = (text || "").toLowerCase();

    let salesMode = "conversation";

    if (!qualified) {
      salesMode = "discovery";
    } else if (
      lower.includes("precio") ||
      lower.includes("cuánto") ||
      lower.includes("cuanto") ||
      lower.includes("vale") ||
      lower.includes("disponible") ||
      lower.includes("tienen")
    ) {
      salesMode = "closing";
    } else {
      salesMode = "recommendation";
    }

    /*
    ========================================
    9. SAFE CATALOG (CRITICAL FIX)
    ========================================
    */

    let safeCatalog = [];

    if (qualified) {
      safeCatalog = catalogResults.slice(0, 1);
    }

    /*
========================================
10. LEAD ENRICHMENT (UNCHANGED)
========================================
*/

    try {
      if (lead?.id) {
        let scoreIncrement = 0;
        let nextStage = lead.stage;

        if (salesMode === "closing") {
          scoreIncrement += 20;
          nextStage = "qualified";
        }

        if (salesMode === "discovery") {
          scoreIncrement += 10;
          if (nextStage === "new") {
            nextStage = "engaged";
          }
        }

        if (lower.includes("comprar") || lower.includes("lo quiero")) {
          scoreIncrement += 30;
          nextStage = "ready_to_buy";
        }

        if (lower.includes("urgente") || lower.includes("para hoy")) {
          scoreIncrement += 15;
        }

        if (scoreIncrement > 0) {
          await db.query(
            `
        UPDATE leads
        SET 
          score = COALESCE(score, 0) + $1,
          stage = $2,
          updated_at = NOW()
        WHERE id = $3
        AND organization_id = $4
      `,
            [scoreIncrement, nextStage, lead.id, organization_id]
          );

          console.log("🧠 Lead enriched:", {
            lead_id: lead.id,
            scoreIncrement,
            nextStage,
          });
        }
      }
    } catch (err) {
      console.warn("⚠️ Lead enrichment error:", err);
    }

    /*
    ========================================
    11. CONFIG
    ========================================
    */

    let config = {};

    try {
      config = await getPromptConfig(organization_id);
    } catch (err) {
      console.warn("⚠️ Config error:", err);
    }

    /*
    ========================================
    12. AI
    ========================================
    */

    let replyText = null;
    let usedAI = false;

    try {
      const prompt = buildPrompt({
  context,
  catalogResults: safeCatalog,
  history,
  memory, // 🔥 NUEVO
  config,
  salesMode,
});

      const aiResponse = await runAI({
        prompt,
      });

      const guarded = applyAIGuards({
        aiResponse,
        context,
      });

      enforceAIRuntime({
        aiResponse: guarded,
        source: "salesBrain",
      });

      if (
        guarded &&
        typeof guarded.text === "string" &&
        guarded.text.trim().length > 0
      ) {
        replyText = guarded.text.trim();
        usedAI = true;
      }
    } catch (err) {
      console.warn("⚠️ AI error:", err);
    }

    /*
    ========================================
    13. FALLBACK
    ========================================
    */

    if (!replyText) {
      replyText =
        "Hola 😊 con mucho gusto le ayudo. ¿Qué tipo de uso le estaría dando al equipo?";
    }

    /*
    ========================================
    14. SAVE ASSISTANT MESSAGE
    ========================================
    */

    if (conversation?.id && replyText) {
      try {
        await saveMessage({
          organization_id,
          conversation_id: conversation.id,
          lead_id: lead?.id,
          role: "assistant",
          text: replyText,
        });
      } catch (err) {
        console.warn("⚠️ Save assistant error:", err);
      }
    }

    /*
    ========================================
    15. FINAL RESPONSE
    ========================================
    */

    return {
      reply: {
        text: replyText,
        products: safeCatalog,
      },
      meta: {
        organization_id,
        channel,
        phone,
        lead_id: lead?.id || null,
        usedAI,
        qualified,
        salesMode,
      },
    };
  } catch (err) {
    console.error("❌ FATAL salesBrain:", err);

    return {
      reply: {
        text:
          "Disculpá 🙏 tuvimos un problema. Intentá de nuevo en un momento.",
      },
      meta: {
        error: true,
      },
    };
  }
}
