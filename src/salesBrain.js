/*
====================================================
EVA CORE — SALES BRAIN (CONVERGENCIA CONTROLADA v1)
====================================================
*/

import OpenAI from "openai";

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import { scheduleFollowup } from "./followupEngine.js";

import { detectIntent } from "./brain/engines/intentEngine.js";
import {
  decideStrategy,
  normalizeIntent as normalizeStrategyIntent,
  normalizeStage as normalizeStrategyStage,
} from "./brain/engines/strategyEngine.js";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/*
====================================================
UTILS
====================================================
*/

function safeString(v) {
  return String(v || "").trim();
}

function clampText(text, max = 420) {
  const t = safeString(text).replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trim() + "…";
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function lower(text) {
  return safeString(text).toLowerCase();
}

function hasAny(text, patterns = []) {
  const t = lower(text);
  return patterns.some((p) => t.includes(String(p).toLowerCase()));
}

/*
====================================================
KNOWN DATA / HEURISTICS
====================================================
*/

function detectBudget(text) {
  const t = safeString(text);

  // ₡150000 / 150000 / 150 mil / 150.000
  const colonMatch = t.match(/₡\s*([\d.,]+)/i);
  if (colonMatch?.[1]) {
    const n = Number(colonMatch[1].replace(/[.,]/g, ""));
    if (!Number.isNaN(n) && n > 0) return n;
  }

  const milMatch = t.match(/(\d{2,3})\s*mil\b/i);
  if (milMatch?.[1]) {
    const n = Number(milMatch[1]) * 1000;
    if (!Number.isNaN(n) && n > 0) return n;
  }

  const rawNumber = t.match(/\b(\d{5,7})\b/);
  if (rawNumber?.[1]) {
    const n = Number(rawNumber[1]);
    if (!Number.isNaN(n) && n > 0) return n;
  }

  return null;
}

function detectUseCase(text) {
  const t = lower(text);

  if (
    hasAny(t, [
      "estudio",
      "colegio",
      "escuela",
      "universidad",
      "clases",
      "tareas",
      "estudiar",
    ])
  ) {
    return "STUDY";
  }

  if (
    hasAny(t, [
      "trabajo",
      "oficina",
      "office",
      "excel",
      "teletrabajo",
      "empresa",
      "empresarial",
    ])
  ) {
    return "WORK";
  }

  if (
    hasAny(t, [
      "diseño",
      "editar",
      "edicion",
      "video",
      "photoshop",
      "render",
      "arquitectura",
    ])
  ) {
    return "CREATIVE";
  }

  if (
    hasAny(t, [
      "gaming",
      "jugar",
      "juegos",
      "fortnite",
      "valorant",
      "warzone",
    ])
  ) {
    return "GAMING";
  }

  return null;
}

function detectProblem(text) {
  const t = lower(text);

  if (
    hasAny(t, [
      "no imprime",
      "no enciende",
      "se apaga",
      "pantalla negra",
      "error",
      "atascada",
      "atasco",
      "batería",
      "bateria",
      "lenta",
      "sobrecalienta",
      "no carga",
      "dañado",
      "danado",
      "fallando",
      "reparar",
      "mantenimiento",
    ])
  ) {
    return safeString(text);
  }

  return null;
}

function detectProductInterest(text) {
  const t = lower(text);

  if (hasAny(t, ["laptop", "compu", "computadora", "portatil"])) {
    return "LAPTOP";
  }

  if (hasAny(t, ["impresora", "printer"])) {
    return "PRINTER";
  }

  if (hasAny(t, ["monitor"])) {
    return "MONITOR";
  }

  if (hasAny(t, ["teclado", "mouse", "accesorio"])) {
    return "ACCESSORY";
  }

  return null;
}

function buildKnownData(text) {
  return {
    budget: detectBudget(text),
    use_case: detectUseCase(text),
    problem: detectProblem(text),
    product_interest: detectProductInterest(text),
  };
}

/*
====================================================
STAGE
====================================================
*/

function detectStage({ intent, text, known_data = {} }) {
  const t = lower(text);

  const hasBudget = !!known_data.budget;
  const hasUseCase = !!known_data.use_case;
  const hasProblem = !!known_data.problem;

  if (intent === "SERVICE") {
    if (!hasProblem) return "EARLY";
    return "QUALIFYING";
  }

  if (
    hasAny(t, [
      "me interesa",
      "precio",
      "cuánto cuesta",
      "cuanto cuesta",
      "disponible",
      "garantía",
      "garantia",
      "fotos",
      "especificaciones",
      "info",
      "información",
      "informacion",
    ])
  ) {
    if (hasBudget && hasUseCase) return "MID";
    return "QUALIFYING";
  }

  if (
    hasAny(t, [
      "me la deja",
      "me lo deja",
      "la compro",
      "lo compro",
      "quiero comprar",
      "apartado",
      "se puede apartar",
      "envío",
      "envio",
      "retiro",
      "dónde están",
      "donde estan",
      "ubicación",
      "ubicacion",
      "pago",
      "sinpe",
      "transferencia",
    ])
  ) {
    return "HOT";
  }

  if (intent === "GREETING") return "EARLY";
  if (hasUseCase || hasBudget) return "QUALIFYING";

  return "EARLY";
}

/*
====================================================
STRATEGY
====================================================
*/

function resolveStrategyDecision(decision) {
  if (!decision) {
    return {
      strategy: "QUALIFY",
    };
  }

  if (typeof decision === "string") {
    return {
      strategy: decision,
    };
  }

  if (typeof decision === "object") {
    return {
      strategy: safeString(decision.strategy || decision.type || "QUALIFY"),
      ...decision,
    };
  }

  return {
    strategy: "QUALIFY",
  };
}

function enforceStrategyRequired(strategy) {
  const normalized = safeString(strategy || "").toUpperCase();

  if (!normalized || normalized === "DEFAULT") {
    return "QUALIFY";
  }

  return normalized;
}

/*
====================================================
AI
====================================================
*/

function normalizeAssistantOutput(raw) {
  if (!raw) return { reply: "", confidence: 0 };

  if (typeof raw === "object") {
    return {
      reply: safeString(raw.reply),
      confidence: Number(raw.confidence || 0),
    };
  }

  const parsed = tryParseJson(raw);

  if (parsed) {
    return {
      reply: safeString(parsed.reply),
      confidence: Number(parsed.confidence || 0),
    };
  }

  return {
    reply: safeString(raw),
    confidence: 0.5,
  };
}

function shouldUseConversationalAI({ intent, strategy }) {
  if (!openai) return false;
  if (intent === "GREETING" && strategy === "QUALIFY") return false;
  return true;
}

function buildPrompt({ organization, context, userText }) {
  const businessName = safeString(organization?.business_name || "el negocio");
  const assistantName = safeString(organization?.assistant_name || "Eva");

  return `
Eres ${assistantName} de ${businessName}.

OBJETIVO:
Guiar la conversación hacia una acción comercial real.

REGLAS OBLIGATORIAS:
- No inventar productos, precios ni servicios.
- Si el cliente pide servicio técnico, primero diagnostica antes de explicar.
- No redirijas a compra si el cliente pidió reparación o mantenimiento.
- Usa lenguaje humano, claro y corto.
- Máximo 1 emoji.
- Siempre intenta avanzar la conversación.
- Si falta contexto, pregunta en vez de asumir.

CONTEXTO ACTUAL:
Intent: ${safeString(context.intent)}
Stage: ${safeString(context.stage)}
Strategy: ${safeString(context.strategy)}

KNOWN DATA:
${JSON.stringify(context.known_data || {}, null, 2)}

MENSAJE DEL CLIENTE:
${safeString(userText)}

Devuelve ÚNICAMENTE JSON válido con este formato:
{
  "reply": "mensaje final para el cliente",
  "confidence": 0.0
}
`;
}

async function runAI(params) {
  if (!openai) {
    return { reply: "", confidence: 0 };
  }

  const prompt = buildPrompt(params);

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion?.choices?.[0]?.message?.content || "";
  return normalizeAssistantOutput(raw);
}

/*
====================================================
RESPONSE CONTROL
====================================================
*/

function buildFallbackReply({ intent, strategy, known_data = {} }) {
  if (intent === "SERVICE" || strategy === "ASK") {
    if (!known_data.problem) {
      return "Con mucho gusto le ayudo 😊 ¿Me podría indicar la marca, el modelo y qué problema está presentando el equipo?";
    }

    return "Gracias por la información 😊 Para ayudarle mejor, ¿me podría confirmar la marca y el modelo del equipo?";
  }

  if (strategy === "QUALIFY") {
    if (!known_data.use_case) {
      return "Con mucho gusto le ayudo 😊 ¿La necesita para estudio, trabajo o algún uso específico?";
    }

    if (!known_data.budget) {
      return "Perfecto 😊 ¿Qué presupuesto aproximado tiene pensado para recomendarle una opción más adecuada?";
    }

    return "Perfecto 😊 Con esa información le puedo orientar mejor. ¿Hay alguna característica que para usted sea importante?";
  }

  if (strategy === "RECOMMEND") {
    return "Perfecto 😊 Ya con esa información le puedo recomendar opciones. ¿Qué presupuesto aproximado tiene pensado?";
  }

  if (strategy === "CLOSE") {
    return "Perfecto 😊 Si gusta le ayudo a avanzar con la compra. ¿Prefiere envío, entrega o retiro?";
  }

  return "Con mucho gusto le ayudo 😊 ¿En qué le puedo ayudar hoy?";
}

function guardReply({ aiResult, stage, strategy, intent, known_data = {} }) {
  const maxLen = stage === "EARLY" ? 260 : 420;
  const confidence = Number(aiResult?.confidence || 0);
  let reply = clampText(aiResult?.reply || "", maxLen);

  if (!reply || confidence < 0.45) {
    return {
      ok: true,
      reply: buildFallbackReply({ intent, strategy, known_data }),
    };
  }

  const lowerReply = lower(reply);

  // SERVICE: siempre primero diagnóstico si falta problema
  if (intent === "SERVICE" && !known_data.problem) {
    return {
      ok: true,
      reply:
        "Con mucho gusto le ayudo 😊 ¿Me podría indicar la marca, el modelo y qué problema está presentando el equipo?",
    };
  }

  // QUALIFY / ASK: forzar pregunta si no la trae
  if (
    (strategy === "ASK" || strategy === "QUALIFY") &&
    !lowerReply.includes("¿")
  ) {
    if (!known_data.use_case && intent !== "SERVICE") {
      reply += " ¿La necesita para estudio, trabajo o algún uso específico?";
    } else if (!known_data.budget && intent !== "SERVICE") {
      reply += " ¿Qué presupuesto aproximado tiene pensado?";
    } else if (intent === "SERVICE") {
      reply += " ¿Me podría indicar la marca, el modelo y qué problema presenta?";
    } else {
      reply += " ¿Me podría confirmar un poco más sobre lo que necesita?";
    }
  }

  // CLOSE: forzar CTA concreto
  if (
    strategy === "CLOSE" &&
    !hasAny(lowerReply, ["envío", "envio", "retiro", "entrega", "apartar"])
  ) {
    reply += " ¿Prefiere envío, entrega o retiro?";
  }

  return {
    ok: true,
    reply: clampText(reply, maxLen),
  };
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  try {
    const organization_id = safeString(payload?.organization_id);
    const phone = safeString(payload?.phone);
    const text = safeString(payload?.text);
    const channel = safeString(payload?.channel || "whatsapp");

    if (!organization_id || !phone || !text) {
      throw new Error("Missing required inbound fields");
    }

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
    });

    const detectedIntent = detectIntent(text);
    const intent = normalizeStrategyIntent(detectedIntent);

    const known_data = buildKnownData(text);

    const detectedStage = detectStage({
      intent,
      text,
      known_data,
    });

    const normalizedStage = normalizeStrategyStage(detectedStage);

    const rawStrategyDecision = decideStrategy({
      intent,
      stage: normalizedStage,
      known_data,
    });

    const strategyDecision = resolveStrategyDecision(rawStrategyDecision);
    let strategy = enforceStrategyRequired(strategyDecision.strategy);

    // Correcciones controladas para evitar estrategias incoherentes
    if (intent === "SERVICE" && !known_data.problem) {
      strategy = "ASK";
    }

    if (
      (intent === "BUY" || intent === "INFO") &&
      normalizedStage === "EARLY" &&
      strategy === "ASK"
    ) {
      strategy = "QUALIFY";
    }

    console.log("🧠 FINAL STRATEGY:", {
      intent,
      stage: normalizedStage,
      strategy,
      known_data,
    });

    /*
    =====================
    AI
    =====================
    */

    let aiReply = null;

    if (shouldUseConversationalAI({ intent, strategy })) {
      try {
        const aiResult = await runAI({
          organization: {
            business_name: "Compu Store",
            assistant_name: "Eva",
          },
          context: {
            intent,
            stage: normalizedStage,
            strategy,
            known_data,
          },
          userText: text,
        });

        const guarded = guardReply({
          aiResult,
          stage: normalizedStage,
          strategy,
          intent,
          known_data,
        });

        if (guarded.ok) {
          aiReply = guarded.reply;
        }
      } catch (aiError) {
        console.error("❌ AI ERROR:", aiError);
      }
    }

    /*
    =====================
    FINAL
    =====================
    */

    let finalText = aiReply;

    if (!finalText) {
      finalText = buildFallbackReply({
        intent,
        strategy,
        known_data,
      });
    }

    finalText = clampText(finalText);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: finalText,
    });

    /*
    =====================
    FOLLOWUP
    =====================
    */

    const shouldFollowUp =
      intent === "BUY" ||
      intent === "INFO" ||
      intent === "SERVICE";

    if (shouldFollowUp) {
      try {
        await scheduleFollowup({
          organization_id,
          lead_id: lead?.id || null,
          phone,
          conversation_id: conversation.id,
          delay_hours: 24,
          reason: "sales_followup",
        });
      } catch (e) {
        console.error("❌ FOLLOWUP ERROR:", e);
      }
    }

    return {
      reply: { text: finalText },
    };
  } catch (err) {
    console.error("❌ HANDLE INBOUND ERROR:", err);

    return {
      reply: {
        text: "Con mucho gusto le ayudo 😊 ¿Me podría repetir su consulta, por favor?",
      },
    };
  }
}
