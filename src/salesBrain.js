/*
====================================================
EVA CORE — SALES BRAIN (P1.3.1 RECONSTRUIDO + FIXED)
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

function normalizeIntent(intent) {
  if (!intent) return "OTHER";

  const clean = String(intent).toUpperCase().trim();

  if (["BUY", "PURCHASE"].includes(clean)) return "BUY";
  if (["INFO", "QUESTION"].includes(clean)) return "INFO";
  if (["SUPPORT", "HELP", "SERVICE"].includes(clean)) return "SERVICE";
  if (["GREETING", "HELLO"].includes(clean)) return "GREETING";
  if (["FOLLOWUP"].includes(clean)) return "FOLLOWUP";
  if (["CLOSE_INTENT"].includes(clean)) return "CLOSE_INTENT";
  if (["UNKNOWN", "OTHER", "DEFAULT"].includes(clean)) return "OTHER";

  return clean;
}

function normalizeStage(stage) {
  const raw = String(stage || "EARLY").toUpperCase().trim();

  if (["NEW", "EARLY"].includes(raw)) return "EARLY";
  if (["QUALIFYING", "QUALIFY", "DISCOVERY"].includes(raw)) return "QUALIFYING";
  if (["MID", "OFFER", "NEGOTIATION"].includes(raw)) return "MID";
  if (["HOT", "READY_TO_BUY", "READY"].includes(raw)) return "HOT";
  if (["POST", "WON", "FOLLOWUP"].includes(raw)) return "POST";

  return "EARLY";
}

function stageToDb(stage) {
  const normalized = normalizeStage(stage);

  if (normalized === "QUALIFYING") return "qualifying";
  if (normalized === "MID") return "mid";
  if (normalized === "HOT") return "hot";
  if (normalized === "POST") return "post";

  return "early";
}

function extractBudget(text = "", lead = {}) {
  if (lead?.budget) return lead.budget;

  const normalized = String(text || "").replace(/[.,]/g, "");
  const amountMatch = normalized.match(
    /(?:₡|crc|colones?|presupuesto\s*(?:de|es)?\s*)(\d{4,9})/i
  );

  if (amountMatch?.[1]) {
    const parsed = Number(amountMatch[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (/econ[oó]mic|barat|accesible/i.test(normalized)) return "LOW_BUDGET";
  if (/premium|mejor|gama alta/i.test(normalized)) return "HIGH_BUDGET";

  return null;
}

function extractUseCase(text = "", lead = {}) {
  if (lead?.use_case) return lead.use_case;

  const t = String(text || "").toLowerCase();

  if (
    t.includes("estudi") ||
    t.includes("colegio") ||
    t.includes("universidad") ||
    t.includes("clases")
  ) {
    return "ESTUDIO";
  }

  if (
    t.includes("trabajo") ||
    t.includes("oficina") ||
    t.includes("excel") ||
    t.includes("empresa")
  ) {
    return "TRABAJO";
  }

  if (t.includes("gaming") || t.includes("juego") || t.includes("jugar")) {
    return "GAMING";
  }

  return null;
}

function extractProductInterest(text = "", lead = {}) {
  if (lead?.product_interest) return lead.product_interest;

  const t = String(text || "").toLowerCase();

  if (t.includes("impresora")) return "IMPRESORA";
  if (t.includes("monitor")) return "MONITOR";
  if (t.includes("laptop") || t.includes("computadora") || t.includes("pc")) {
    return "LAPTOP";
  }
  if (t.includes("mantenimiento")) return "MANTENIMIENTO";
  if (t.includes("reparacion") || t.includes("reparación")) return "REPARACION";

  return null;
}

function extractProblem(text = "") {
  const t = String(text || "").toLowerCase();

  if (
    t.includes("no sirve") ||
    t.includes("no enciende") ||
    t.includes("error") ||
    t.includes("no imprime") ||
    t.includes("fallando") ||
    t.includes("esta lenta") ||
    t.includes("está lenta") ||
    t.includes("dañado") ||
    t.includes("danado")
  ) {
    return "DETECTED";
  }

  return null;
}

function computeInterestLevel(intent, text = "") {
  const t = String(text || "").toLowerCase();

  if (
    intent === "CLOSE_INTENT" ||
    t.includes("lo quiero") ||
    t.includes("como pago") ||
    t.includes("cómo pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("apartar") ||
    t.includes("reservar")
  ) {
    return "HIGH";
  }

  if (
    intent === "BUY" ||
    t.includes("precio") ||
    t.includes("disponible") ||
    t.includes("me interesa")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function computeLeadScore({ intent, stage, text = "" }) {
  let score = 25;
  const t = String(text || "").toLowerCase();

  if (intent === "BUY") score += 20;
  if (intent === "SERVICE") score += 15;
  if (intent === "CLOSE_INTENT") score += 40;
  if (stage === "QUALIFYING") score += 10;
  if (stage === "MID") score += 20;
  if (stage === "HOT") score += 35;

  if (t.includes("precio") || t.includes("cuánto") || t.includes("cuanto")) {
    score += 10;
  }
  if (t.includes("hoy") || t.includes("ahora") || t.includes("urgente")) {
    score += 10;
  }
  if (
    t.includes("apartar") ||
    t.includes("reservar") ||
    t.includes("comprar")
  ) {
    score += 15;
  }

  return Math.min(score, 100);
}

function buildKnownData({ text = "", lead = {} }) {
  const extracted = {
    product_interest: extractProductInterest(text, lead),
    use_case: extractUseCase(text, lead),
    budget: extractBudget(text, lead),
    problem: extractProblem(text),
  };

  return {
    product_interest:
      extracted.product_interest || lead?.product_interest || null,

    use_case:
      extracted.use_case || lead?.use_case || null,

    budget:
      extracted.budget || lead?.budget || null,

    problem:
      extracted.problem || null, // runtime únicamente
  };
}

function detectStage({ intent, lead, text = "", knownData = {} }) {
  const currentStage = normalizeStage(lead?.stage);
  const t = String(text || "").toLowerCase();

  if (intent === "GREETING") return currentStage;

  if (intent === "SERVICE") {
    if (knownData.problem) return "QUALIFYING";
    return currentStage === "EARLY" ? "EARLY" : currentStage;
  }

  if (intent === "CLOSE_INTENT") return "HOT";

  if (intent === "BUY") {
    if (!knownData.use_case || !knownData.budget) return "QUALIFYING";

    if (
      t.includes("precio") ||
      t.includes("cuánto") ||
      t.includes("cuanto") ||
      t.includes("vale") ||
      t.includes("disponible")
    ) {
      return "MID";
    }

    if (
      t.includes("lo quiero") ||
      t.includes("como pago") ||
      t.includes("cómo pago") ||
      t.includes("apartar") ||
      t.includes("reservar")
    ) {
      return "HOT";
    }

    return "MID";
  }

  if (intent === "FOLLOWUP") {
    if (currentStage === "HOT") return "HOT";
    if (currentStage === "EARLY") return "QUALIFYING";
    return currentStage;
  }

  return currentStage;
}

function decideStrategy({ intent, stage = "EARLY", known_data = {} }) {
  const hasProblem = !!known_data.problem;
  const hasUseCase = !!known_data.use_case;
  const hasBudget = !!known_data.budget;
  const hasProductInterest = !!known_data.product_interest;

  if (intent === "SERVICE") {
    if (!hasProblem) return "ASK_DIAGNOSIS";
    return "EXPLAIN_CLOSE";
  }

  if (intent === "CLOSE_INTENT") return "CLOSE";

  if (intent === "BUY") {
    if (stage === "EARLY") return "QUALIFY";

    if (stage === "QUALIFYING") {
      if (!hasUseCase || !hasBudget) return "QUALIFY";
      return "RECOMMEND";
    }

    if (stage === "MID") {
      if (hasUseCase || hasBudget || hasProductInterest) return "RECOMMEND";
      return "QUALIFY";
    }

    if (stage === "HOT") return "CLOSE";

    return "QUALIFY";
  }

  if (intent === "INFO") return "EDUCATE";
  if (intent === "FOLLOWUP") return stage === "HOT" ? "CLOSE" : "FOLLOWUP";
  if (intent === "GREETING") return "OPEN";

  return "DEFAULT";
}

function isHotLeadIntent(intent, text = "", orgConfig = {}) {
  const signals = getHotSignals(orgConfig);
  return intent === "CLOSE_INTENT" || matchHotSignals(text, signals);
}

function buildSalesRadar({ intent, text = "" }) {
  const t = String(text || "").toLowerCase();

  if (intent !== "BUY") return "";

  if (
    t.includes("estudi") ||
    t.includes("colegio") ||
    t.includes("universidad")
  ) {
    return `
OPORTUNIDAD DETECTADA:
Cliente busca equipo para estudio.
Prioriza:
- equipos confiables
- buena batería
- precio accesible
Sugiere soluciones prácticas.
`;
  }

  if (t.includes("trabajo") || t.includes("oficina") || t.includes("excel")) {
    return `
OPORTUNIDAD DETECTADA:
Cliente busca equipo para trabajo.
Prioriza:
- rendimiento estable
- multitarea
- durabilidad
`;
  }

  if (t.includes("rápida") || t.includes("rapida") || t.includes("lenta")) {
    return `
OPORTUNIDAD DETECTADA:
Cliente tiene problema de rendimiento.
Sugiere:
- upgrade SSD
- aumento de RAM
`;
  }

  return "";
}

function cleanAIText(text = "", agentName = "Eva") {
  let cleaned = String(text || "").trim();

  cleaned = cleaned.replace(/^(cliente|usuario)\s*:\s*/i, "");
  cleaned = cleaned.replace(/^(asistente|assistant)\s*:\s*/i, "");
  cleaned = cleaned.replace(new RegExp(`^${agentName}\\s*:\\s*`, "i"), "");

  if (/^(cliente|usuario)\s*:/.test(cleaned.toLowerCase())) {
    const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
    const assistantLine =
      lines.find(
        (line) =>
          !/^(cliente|usuario)\s*:/.test(line.toLowerCase()) &&
          !/^historial\s*:/.test(line.toLowerCase())
      ) || "";
    cleaned = assistantLine
      .replace(/^(asistente|assistant)\s*:\s*/i, "")
      .replace(new RegExp(`^${agentName}\\s*:\\s*`, "i"), "")
      .trim();
  }

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}

async function createFollowupIfNeeded({
  organization_id,
  conversation_id,
  phone,
  reason = "sales_followup",
  hoursFromNow = 24,
}) {
  try {
    if (!organization_id || !conversation_id || !phone) return;

    const existingFollowup = await db.query(
      `
      SELECT id
      FROM followups
      WHERE organization_id = $1
        AND conversation_id = $2
        AND UPPER(status) IN ('PENDING', 'SCHEDULED', 'RUNNING')
      LIMIT 1
      `,
      [organization_id, conversation_id]
    );

    if (existingFollowup.rows.length > 0) return;

    await db.query(
      `
      INSERT INTO followups (
        organization_id,
        conversation_id,
        lead_phone,
        reason,
        status,
        scheduled_for,
        due_at,
        sent,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'PENDING',
        NOW() + ($5 || ' hours')::interval,
        NOW() + ($5 || ' hours')::interval,
        false,
        NOW(),
        NOW()
      )
      `,
      [organization_id, conversation_id, phone, reason, String(hoursFromNow)]
    );
  } catch (err) {
    console.error("❌ createFollowupIfNeeded error:", err);
  }
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
        promptConfig?.business_name ||
        orgSettings?.business_name ||
        "el negocio",

      assistant_name:
        context?.assistant?.name ||
        promptConfig?.agent_name ||
        orgSettings?.assistant_name ||
        "Asistente",

      tone:
        context?.assistant?.tone ||
        promptConfig?.tone ||
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
      `
      SELECT role, content AS text
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT 10
      `,
      [conversation.id]
    );

    const history = historyRes.rows || [];
    const t = String(text || "").toLowerCase();

    let refinedIntent = normalizeIntent(detectIntent(text));

    if (refinedIntent === "OTHER" && history.length > 1) {
      refinedIntent = "FOLLOWUP";
    }
    if (refinedIntent === "INFO" && t.includes("precio")) {
      refinedIntent = "BUY";
    }
    if (
      refinedIntent === "GREETING" &&
      (t.includes("busco") || t.includes("ocupo"))
    ) {
      refinedIntent = "BUY";
    }
    if (
      t.includes("no sirve") ||
      t.includes("error") ||
      t.includes("mantenimiento") ||
      t.includes("repar")
    ) {
      refinedIntent = "SERVICE";
    }

    await savePipelineEvent({
      organization_id,
      lead_id: lead?.id || null,
      event_type: "INTENT_DETECTED",
      metadata: {
        intent: refinedIntent,
        text,
      },
    });

    const knownData = buildKnownData({ text, lead });
    const stage = detectStage({
      intent: refinedIntent,
      lead,
      text,
      knownData,
    });
    const strategy = decideStrategy({
      intent: refinedIntent,
      stage,
      known_data: knownData,
    });
    
// 🔴 ENFORCE STRATEGY
const enforcedStrategy = enforceStrategyRequired(strategy, {
  intent: refinedIntent,
  stage,
  knownData,
});
    
    await savePipelineEvent({
      organization_id,
      lead_id: lead?.id || null,
      event_type: "STAGE_UPDATED",
      metadata: { stage },
    });

    await savePipelineEvent({
      organization_id,
      lead_id: lead?.id || null,
      event_type: "STRATEGY_SELECTED",
      metadata: { strategy, stage, intent: refinedIntent },
    });

    const shouldSearchCatalog =
      refinedIntent === "BUY" ||
      refinedIntent === "INFO" ||
      refinedIntent === "CLOSE_INTENT";

    if (shouldSearchCatalog) {
      try {
        const results = await searchCatalogSmart({
          organization_id,
          query: text,
        });

        safeCatalog = (results || []).slice(0, 3);
      } catch {}
    }

    const salesRadar = buildSalesRadar({ intent: refinedIntent, text });
    const isQualificationPhase =
      strategy === "QUALIFY" && !isHotLeadIntent(refinedIntent, t, promptConfig);

    let aiText = null;

    if (enforcedStrategy) {
      const prompt = buildPrompt({
  context: {
    intent: refinedIntent,
    stage,
    strategy,
    organization: orgContext,
    sales_radar: salesRadar,
    known_data: knownData, // ✅ INYECCIÓN CRÍTICA
    force_mode: isQualificationPhase ? "QUALIFY_ONLY" : null,
  },
        catalogResults:
          isQualificationPhase ||
          refinedIntent === "SERVICE" ||
          refinedIntent === "GREETING" ||
          strategy === "OPEN" ||
          strategy === "ASK_DIAGNOSIS"
            ? []
            : safeCatalog,
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
  const cleanedAIText = cleanAIText(
    guarded.text,
    orgContext?.assistant_name || "Eva"
  );

  if (cleanedAIText) {
    let finalAIText = cleanedAIText;

    // 🔒 VALIDACIÓN POR STRATEGY
    if (strategy === "QUALIFY") {
      const hasQuestion = finalAIText.includes("?");

      if (!hasQuestion) {
        finalAIText =
          "Con mucho gusto le ayudo 😊 ¿Me podría contar un poco más sobre lo que necesita?";
      }
    }

    if (strategy === "ASK_DIAGNOSIS") {
      const hasQuestion = finalAIText.includes("?");

      if (!hasQuestion) {
        finalAIText =
          "Con mucho gusto le ayudo 😊 ¿Me podría indicar qué problema presenta el equipo?";
      }
    }

    aiText = formatAIResponse({
      text: finalAIText,
      agentName: orgContext?.assistant_name || "Eva",
    });
  }
}

    let fallbackReply = `Hola 😊 con mucho gusto le ayudo. ¿En qué le puedo ayudar?`;

    const replyText =
      !aiText || aiText.length < 5 || aiText.toLowerCase().includes("no sé")
        ? fallbackReply
        : aiText;

    const shouldInjectProducts =
      refinedIntent === "CLOSE_INTENT" ||
      (refinedIntent === "BUY" && stage !== "QUALIFYING" && strategy !== "OPEN");

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

    const memory = {
      budget: knownData.budget,
      use_case: knownData.use_case,
      product_interest: knownData.product_interest,
      interest_level: computeInterestLevel(refinedIntent, text),
      last_intent: refinedIntent,
    };

    await updateLeadMemory({
      organization_id,
      lead_id: lead?.id,
      memory,
    });

    await savePipelineEvent({
      organization_id,
      lead_id: lead?.id || null,
      event_type: "LEAD_MEMORY_UPDATED",
      metadata: memory,
    });

    const leadScore = computeLeadScore({
      intent: refinedIntent,
      stage,
      text,
    });

    try {
      await updateLeadStageAndScore({
        organization_id,
        lead_id: lead?.id,
        new_stage: stageToDb(stage),
        new_score: leadScore,
      });
    } catch (err) {
      console.error("STAGE_UPDATE_ERROR", err);
    }

    const isHotLead =
      isHotLeadIntent(refinedIntent, t, promptConfig) || stage === "HOT";

    if (!isHotLead) {
      await createFollowupIfNeeded({
        organization_id,
        conversation_id: conversation.id,
        phone,
      });
    }

    return {
      reply,
      meta: {
        intent: refinedIntent,
        stage,
        strategy,
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
