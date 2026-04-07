/*
====================================================
EVA CORE — SALES BRAIN (CLEAN P5 FIXED)
====================================================
*/

import db, {
  getOrganizationSettings,
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
  savePipelineEvent,
  updateLeadStageAndScore,
  updateLeadMemory,
} from "./db.js";

import { matchHotSignals, getHotSignals } from "./brain/utils/intentSignals.js";
import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";
import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";
import { detectIntent } from "./brain/engines/intentEngine.js";
import { formatAIResponse } from "./brain/utils/responseFormatter.js";

/*
====================================================
HELPERS
====================================================
*/

function decideStrategy({
  intent,
  stage = "EARLY",
  known_data = {},
}) {
  const hasProblem = !!known_data.problem;
  const hasUseCase = !!known_data.use_case;
  const hasBudget = !!known_data.budget;
  const hasProductInterest = !!known_data.product_interest;

  // ================================
  // SERVICE
  // ================================
  if (intent === "SERVICE") {
    if (!hasProblem) return "ASK_DIAGNOSIS";
    return "EXPLAIN_CLOSE";
  }

  // ================================
  // BUY / CLOSE
  // ================================
  if (intent === "CLOSE_INTENT") {
    return "CLOSE";
  }

  if (intent === "BUY") {
    if (stage === "EARLY") {
      if (!hasUseCase && !hasBudget) return "QUALIFY";
      if (hasUseCase || hasBudget || hasProductInterest) return "RECOMMEND";
      return "QUALIFY";
    }

    if (stage === "QUALIFYING") {
      if (!hasUseCase || !hasBudget) return "QUALIFY";
      return "RECOMMEND";
    }

    if (stage === "MID") {
      return "RECOMMEND";
    }

    if (stage === "HOT") {
      return "CLOSE";
    }

    return "QUALIFY";
  }

  // ================================
  // INFO
  // ================================
  if (intent === "INFO") {
    return "EDUCATE";
  }

  // ================================
  // FOLLOWUP
  // ================================
  if (intent === "FOLLOWUP") {
    if (stage === "HOT") return "CLOSE";
    return "FOLLOWUP";
  }

  // ================================
  // GREETING / DEFAULT
  // ================================
  if (intent === "GREETING") {
    return "OPEN";
  }

  return "DEFAULT";
}

function normalizeIntent(intent) {
  if (!intent) return "OTHER";

  const clean = String(intent).toUpperCase().trim();

  if (["BUY", "PURCHASE"].includes(clean)) return "BUY";
  if (["INFO", "QUESTION"].includes(clean)) return "INFO";
  if (["SUPPORT", "HELP", "SERVICE"].includes(clean)) return "SERVICE";
  if (["GREETING", "HELLO"].includes(clean)) return "GREETING";
  if (["FOLLOWUP"].includes(clean)) return "FOLLOWUP";
  if (["CLOSE_INTENT"].includes(clean)) return "CLOSE_INTENT";

  return clean;
}

function isHotLeadIntent(intent, text = "", orgConfig = {}) {
  const signals = getHotSignals(orgConfig);

  return intent === "CLOSE_INTENT" || matchHotSignals(text, signals);
}

function detectStage({ intent, lead, text = "" }) {
  const currentStage = lead?.stage || "EARLY";

  if (intent === "GREETING") return currentStage;

  if (intent === "BUY") {
    if (!lead?.use_case) return "QUALIFYING";

    if (
      text.toLowerCase().includes("precio") ||
      text.toLowerCase().includes("cuánto") ||
      text.toLowerCase().includes("vale")
    ) {
      return "HOT";
    }

    return "MID";
  }

  if (intent === "CLOSE_INTENT") return "HOT";
  if (intent === "FOLLOWUP") return "MID";

  return currentStage;
}
function buildKnownData({ text = "", lead = {} }) {
  const lower = String(text || "").toLowerCase();

  const extracted = {
    product_interest:
      lead?.product_interest ||
      (lower.includes("laptop") ||
      lower.includes("computadora") ||
      lower.includes("impresora") ||
      lower.includes("monitor")
        ? true
        : false),

    use_case:
      lead?.use_case ||
      (lower.includes("estudio") ||
      lower.includes("colegio") ||
      lower.includes("universidad") ||
      lower.includes("trabajo") ||
      lower.includes("oficina")
        ? "detected"
        : null),

    budget:
      lead?.budget ||
      (lower.includes("presupuesto") ||
      lower.includes("económica") ||
      lower.includes("barata") ||
      lower.includes("precio")
        ? "mentioned"
        : null),

    problem:
      lower.includes("no sirve") ||
      lower.includes("no enciende") ||
      lower.includes("error") ||
      lower.includes("no imprime") ||
      lower.includes("fallando")
        ? "detected"
        : null,
  };

  return extracted;
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  const { context = {} } = payload;

  try {
    const { organization_id, phone, text, channel, message_id } = payload;

    let safeCatalog = [];
    let promptConfig = null;
    let orgSettings = null;

    try {
      promptConfig = await getPromptConfig(organization_id);
    } catch {}

    try {
      orgSettings = await getOrganizationSettings(organization_id);
    } catch {}

    const orgContext = {
      business_name:
        context?.organization?.business_name ||
        orgSettings?.business_name ||
        "el negocio",

      assistant_name:
        context?.assistant?.name ||
        orgSettings?.assistant_name ||
        "asistente",

      tone:
        context?.assistant?.tone ||
        orgSettings?.tone ||
        "profesional",
    };

    const lead = await findOrCreateLead({ organization_id, phone });

    const conversation = await findOrCreateConversation({
      organization_id,
      phone,
      channel,
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      text,
      message_id,
    });

    const historyRes = await db.query(
      `SELECT role, content AS text
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 10`,
      [conversation.id]
    );

    const history = historyRes.rows || [];

    let refinedIntent = normalizeIntent(detectIntent(text));
    const t = String(text || "").toLowerCase();

    await savePipelineEvent({
  organization_id,
  lead_id: lead.id,
  event_type: "INTENT_DETECTED",
  metadata: {
    intent: refinedIntent,
    text,
  },
});

    if (refinedIntent === "OTHER" && history.length > 0) {
      refinedIntent = "FOLLOWUP";
    }

    if (refinedIntent === "INFO" && t.includes("precio")) refinedIntent = "BUY";
    if (refinedIntent === "GREETING" && t.includes("busco")) refinedIntent = "BUY";
    if (t.includes("no sirve") || t.includes("error")) refinedIntent = "SERVICE";

const knownData = buildKnownData({
  text,
  lead,
});

const strategy = decideStrategy({
  intent: refinedIntent,
  stage,
  known_data: knownData,
});

    const stage = detectStage({
      intent: refinedIntent,
      lead,
      text,
    });
await savePipelineEvent({
  organization_id,
  lead_id: lead.id,
  event_type: "STAGE_UPDATED",
  metadata: {
    stage,
  },
});
    
    const shouldUseAI = !!strategy;

    try {
      const results = await searchCatalogSmart({
        organization_id,
        query: text,
      });

      safeCatalog = (results || []).slice(0, 3);

      if (refinedIntent === "GREETING" || refinedIntent === "SERVICE") {
        safeCatalog = [];
      }
    } catch {}

    let aiText = null;

    // ================================
// SALES RADAR (P1.6)
// ================================
let salesRadar = "";

if (refinedIntent === "BUY") {
  if (t.includes("estudi") || t.includes("colegio") || t.includes("universidad")) {
    salesRadar = `
OPORTUNIDAD DETECTADA:
Cliente busca equipo para estudio.
Prioriza:
- equipos confiables
- buena batería
- precio accesible
Sugiere soluciones prácticas.
`;
  }

  if (t.includes("trabajo") || t.includes("oficina")) {
    salesRadar = `
OPORTUNIDAD DETECTADA:
Cliente busca equipo para trabajo.
Prioriza:
- rendimiento estable
- multitarea
- durabilidad
`;
  }

  if (t.includes("rápida") || t.includes("lenta")) {
    salesRadar = `
OPORTUNIDAD DETECTADA:
Cliente tiene problema de rendimiento.
Sugiere:
- upgrade SSD
- aumento de RAM
`;
  }
}
    
    // ================================
    // AI (ÚNICO BLOQUE)
    // ================================
    if (shouldUseAI) {
      const isQualificationPhase =
        refinedIntent === "BUY" &&
        !isHotLeadIntent(refinedIntent, t, promptConfig);

      const prompt = buildPrompt({
        context: {
          intent: refinedIntent,
          stage,
          strategy,
          organization: orgContext,
          sales_radar: salesRadar,
          force_mode: isQualificationPhase ? "QUALIFY_ONLY" : null,
        },
        catalogResults: isQualificationPhase ? [] : safeCatalog,
        history,
        promptConfig,
      });

      const aiResult = await runAI({
        prompt: [
          {
            role: "system",
            content: prompt,
          },
        ],
      });

      enforceAIRuntime({ aiResponse: aiResult });

      const guarded = applyAIGuards({ aiResponse: aiResult });

      if (guarded?.text) {
        aiText = formatAIResponse({
          text: guarded.text,
          agentName: orgContext?.assistant_name || "Eva",
        });
      }
    }

    // ================================
    // FALLBACK + REPLY
    // ================================
    const fallbackGreeting =
      promptConfig?.greeting ||
      `Hola 😊 le atiende ${
        orgContext?.assistant_name || "nuestro equipo"
      }, ¿en qué le puedo ayudar?`;

    const replyText =
      !shouldUseAI
        ? fallbackGreeting
        : !aiText || aiText.length < 5 || aiText.includes("no sé")
        ? fallbackGreeting
        : aiText;

    const shouldInjectProducts =
      refinedIntent === "CLOSE_INTENT";

    const reply = generateReply({
      text: replyText,
      intent: refinedIntent,
      products: shouldInjectProducts ? safeCatalog : [],
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: reply.text,
    });

    try {
      await updateLeadStageAndScore({
        organization_id,
        phone,
        stage,
      });
    } catch (err) {
      console.error("STAGE_UPDATE_ERROR", err);
    }

    return {
      reply,
      meta: {
        intent: refinedIntent,
        lead_id: lead?.id || null,
        conversation_id: conversation.id,
      },
    };
  } catch (err) {
    console.error("❌ SALES BRAIN ERROR:", err);

    return {
      reply: {
        text: "Hubo un problema procesando tu solicitud. Intenta nuevamente.",
      },
      meta: {
        intent: "ERROR",
        lead_id: null,
        conversation_id: null,
      },
    };
  }
}
