import OpenAI from "openai";
import { buildEvaPrompt } from "../utils/promptBuilder.js";
import { validateAIResult, sanitizeAIReply } from "../utils/aiGuards.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EVA_AI_MODEL = process.env.EVA_AI_MODEL || "gpt-4o-mini";
const EVA_AI_MODE = process.env.EVA_AI_MODE || "HYBRID";
const EVA_AI_CONFIDENCE_THRESHOLD = Number(
  process.env.EVA_AI_CONFIDENCE_THRESHOLD || 0.75
);

let openai = null;

if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
} else {
  console.warn("⚠️ OPENAI_API_KEY missing - aiEngine running in fallback-only mode");
}

/**
 * Respuesta fallback segura si AI falla o no está disponible.
 */
function buildFallbackResult({
  fallbackReply = "Hola 😊 con gusto te ayudo. Contame un poco más para orientarte mejor.",
  reason = "AI_UNAVAILABLE",
  meta = {}
} = {}) {
  return {
    ok: false,
    source: "fallback",
    reply: sanitizeAIReply(fallbackReply),
    intent: "UNKNOWN",
    confidence: 0,
    stage: "UNQUALIFIED",
    entities: {},
    suggested_actions: [],
    escalate_to_human: false,
    reason,
    meta
  };
}

/**
 * Intenta parsear JSON aunque venga con markdown fences o texto extra.
 */
function safeParseJSON(rawText) {
  if (!rawText || typeof rawText !== "string") return null;

  const trimmed = rawText.trim();

  // Caso 1: JSON limpio
  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  // Caso 2: fenced block ```json ... ```
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch (_) {}
  }

  // Caso 3: tomar primer bloque entre { ... }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }

  return null;
}

/**
 * Llamada principal a la IA.
 *
 * input esperado:
 * {
 *   organization,
 *   conversation,
 *   lead,
 *   messages,
 *   catalog,
 *   business_rules,
 *   tone,
 *   objectives,
 *   fallbackReply
 * }
 */
export async function generateAIReply(input = {}) {
  const {
    fallbackReply,
    organization,
    conversation,
    lead,
    messages = [],
    catalog = [],
    business_rules = [],
    tone = null,
    objectives = [],
    meta = {}
  } = input;

  if (!openai) {
    return buildFallbackResult({
      fallbackReply,
      reason: "OPENAI_MISSING",
      meta: { ...meta, model: null, mode: EVA_AI_MODE }
    });
  }

  try {
    const prompt = buildEvaPrompt({
      organization,
      conversation,
      lead,
      messages,
      catalog,
      business_rules,
      tone,
      objectives
    });

    const response = await openai.chat.completions.create({
      model: EVA_AI_MODEL,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: prompt.system
        },
        {
          role: "user",
          content: prompt.user
        }
      ]
    });

    const rawText =
      response?.choices?.[0]?.message?.content?.trim() || "";

    const parsed = safeParseJSON(rawText);

    if (!parsed) {
      return buildFallbackResult({
        fallbackReply,
        reason: "AI_INVALID_JSON",
        meta: {
          ...meta,
          model: EVA_AI_MODEL,
          mode: EVA_AI_MODE,
          raw_preview: rawText.slice(0, 500)
        }
      });
    }

    const validated = validateAIResult(parsed, {
      confidenceThreshold: EVA_AI_CONFIDENCE_THRESHOLD
    });

    if (!validated.ok) {
      return buildFallbackResult({
        fallbackReply,
        reason: validated.reason || "AI_VALIDATION_FAILED",
        meta: {
          ...meta,
          model: EVA_AI_MODEL,
          mode: EVA_AI_MODE,
          validation_errors: validated.errors || []
        }
      });
    }

    return {
      ok: true,
      source: "ai",
      reply: sanitizeAIReply(validated.data.reply),
      intent: validated.data.intent,
      confidence: validated.data.confidence,
      stage: validated.data.stage,
      entities: validated.data.entities,
      suggested_actions: validated.data.suggested_actions,
      escalate_to_human: validated.data.escalate_to_human,
      reason: validated.data.reason || "",
      meta: {
        ...meta,
        model: EVA_AI_MODEL,
        mode: EVA_AI_MODE,
        usage: response?.usage || null
      }
    };
  } catch (error) {
    console.error("❌ aiEngine.generateAIReply error:", error?.message || error);

    return buildFallbackResult({
      fallbackReply,
      reason: "AI_RUNTIME_ERROR",
      meta: {
        ...meta,
        model: EVA_AI_MODEL,
        mode: EVA_AI_MODE,
        error_message: error?.message || "Unknown AI error"
      }
    });
  }
}

/**
 * Decide si conviene usar AI.
 * Esta versión es simple y segura para el Bloque 4.1.
 */
export function shouldUseAI({
  text = "",
  heuristicReply = "",
  heuristicIntent = "UNKNOWN",
  confidence = 0,
  hasCatalogMatches = false,
  messageCount = 0,
  humanTakeover = false
} = {}) {
  const normalizedText = String(text || "").trim().toLowerCase();
  const normalizedReply = String(heuristicReply || "").trim().toLowerCase();

  if (humanTakeover) {
    return {
      should_use_ai: false,
      reason: "HUMAN_TAKEOVER_ACTIVE",
      mode: EVA_AI_MODE
    };
  }

  // Saludos o mensajes ultra cortos: heurística basta
  if (
    normalizedText.length <= 3 ||
    ["hola", "buenas", "info", "precio", "ok", "gracias"].includes(normalizedText)
  ) {
    return {
      should_use_ai: false,
      reason: "SIMPLE_MESSAGE",
      mode: EVA_AI_MODE
    };
  }

  // Si ya tenemos intención alta y respuesta buena, no hace falta AI
  if (confidence >= 0.85 && heuristicIntent !== "UNKNOWN" && normalizedReply.length >= 20) {
    return {
      should_use_ai: false,
      reason: "HEURISTIC_STRONG_ENOUGH",
      mode: EVA_AI_MODE
    };
  }

  // Preguntas abiertas o ambiguas
  const openQuestionSignals = [
    "cuál me recomiendas",
    "que me recomiendas",
    "cuál es mejor",
    "cual es mejor",
    "me sirve",
    "quiero saber",
    "necesito ayuda",
    "busco algo",
    "estoy buscando",
    "tienes opciones",
    "qué opción",
    "que opción",
    "para mi hija",
    "para trabajo",
    "para estudiar",
    "para edición",
    "para editar"
  ];

  if (openQuestionSignals.some((signal) => normalizedText.includes(signal))) {
    return {
      should_use_ai: true,
      reason: "OPEN_ENDED_OR_RECOMMENDATION",
      mode: EVA_AI_MODE
    };
  }

  // Si no hay match fuerte, AI puede conversar mejor
  if (heuristicIntent === "UNKNOWN" || confidence < 0.70) {
    return {
      should_use_ai: true,
      reason: "LOW_HEURISTIC_CONFIDENCE",
      mode: EVA_AI_MODE
    };
  }

  // Si ya hay contexto conversacional y catálogo, AI puede hilar mejor
  if (messageCount >= 3 && hasCatalogMatches) {
    return {
      should_use_ai: true,
      reason: "CONTEXTUAL_FOLLOWUP_WITH_CATALOG",
      mode: EVA_AI_MODE
    };
  }

  return {
    should_use_ai: false,
    reason: "HEURISTIC_DEFAULT",
    mode: EVA_AI_MODE
  };
}
