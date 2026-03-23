/**
 * Construye el prompt dinámico para EVA (AI-first)
 * Basado en:
 * - negocio
 * - tono
 * - reglas
 * - contexto conversacional
 * - catálogo
 */

function formatCatalog(catalog = []) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return "No hay productos disponibles.";
  }

  return catalog
    .slice(0, 10) // limitar para no explotar tokens
    .map((p, i) => {
      return `${i + 1}. ${p.name || "Producto"}
- Precio: ${p.price || "No especificado"}
- Descripción: ${p.description || "Sin descripción"}
- Categoría: ${p.category || "General"}`;
    })
    .join("\n\n");
}

function formatMessages(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "Sin historial previo.";
  }

  return messages
    .slice(-6) // últimos mensajes
    .map((m) => {
      return `${m.role === "assistant" ? "EVA" : "CLIENTE"}: ${m.content}`;
    })
    .join("\n");
}

function formatRules(rules = []) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return `
- No inventar precios
- No prometer stock si no es seguro
- No ofrecer descuentos no autorizados
- Siempre cerrar con siguiente paso
`;
  }

  return rules.map((r) => `- ${r}`).join("\n");
}

export function buildEvaPrompt({
  organization = {},
  conversation = {},
  lead = {},
  messages = [],
  catalog = [],
  business_rules = [],
  tone = null,
  objectives = []
} = {}) {
  const businessName = organization?.name || "el negocio";
  const businessType = organization?.type || "negocio";

  const toneText =
    tone ||
    "Cercano, profesional, claro, humano. No robótico. No técnico. Máximo 1 emoji.";

  const objectivesText =
    objectives?.length > 0
      ? objectives.map((o) => `- ${o}`).join("\n")
      : `
- Entender qué necesita el cliente
- Recomendar la mejor opción
- Generar confianza
- Llevar a una acción (visita, compra o contacto)
`;

  const system = `
Eres EVA, una asistente comercial experta en ventas por WhatsApp.

Trabajas para ${businessName}, un ${businessType}.

Tu objetivo es ayudar al cliente, entender su necesidad y guiarlo hacia una decisión de compra.

ESTILO:
${toneText}

REGLAS IMPORTANTES:
${formatRules(business_rules)}

OBJETIVOS:
${objectivesText}

CATÁLOGO:
${formatCatalog(catalog)}

INSTRUCCIONES CRÍTICAS:
- Responde de forma natural y humana
- No inventes información
- No respondas como bot
- No des explicaciones técnicas complejas
- Siempre intenta avanzar la conversación
- Mantén mensajes claros y no muy largos

FORMATO DE RESPUESTA (OBLIGATORIO JSON):
{
  "reply": "mensaje listo para enviar por WhatsApp",
  "intent": "BUY_INTENT | INFO | SUPPORT | GREETING | UNKNOWN",
  "confidence": 0.0,
  "stage": "UNQUALIFIED | QUALIFYING | RECOMMENDING | CLOSING",
  "entities": {
    "budget": null,
    "use_case": null
  },
  "suggested_actions": [],
  "escalate_to_human": false,
  "reason": ""
}
`;

  const user = `
CONTEXTO DE LA CONVERSACIÓN:

Cliente: ${lead?.name || "Cliente"}
Teléfono: ${lead?.phone || "No disponible"}

Estado actual: ${conversation?.stage || "UNQUALIFIED"}

HISTORIAL:
${formatMessages(messages)}

MENSAJE ACTUAL DEL CLIENTE:
"${messages?.[messages.length - 1]?.content || ""}"

Genera la mejor respuesta posible siguiendo las reglas.
`;

  return {
    system: system.trim(),
    user: user.trim()
  };
}
