/*
====================================================
EVA CORE — PROMPT BUILDER (CONTROLLED EXPANSION vNEXT v3)
====================================================
*/

function safe(value) {
  return String(value || "").trim();
}

function formatHistory(history = [], agentName = "Asistente") {
  return history
    .slice(-6)
    .map((m) => {
      const speaker = m.role === "user" ? "Cliente" : agentName;
      return `${speaker}: ${safe(m.content)}`;
    })
    .filter(Boolean)
    .join("\n");
}

function formatCatalog(catalogResults = []) {
  if (!Array.isArray(catalogResults) || catalogResults.length === 0) {
    return "SIN RESULTADOS RELEVANTES";
  }

  return catalogResults
    .slice(0, 5)
    .map((p, i) => {
      const name = safe(p?.name) || "Producto";
      const price = safe(p?.price);
      return `${i + 1}. ${name}${price ? ` — ₡${price}` : ""}`;
    })
    .join("\n");
}

function formatRestrictions(restrictions = []) {
  if (!Array.isArray(restrictions) || restrictions.length === 0) {
    return "- No inventar información\n- Pedir confirmación si falta contexto";
  }

  return restrictions.map((r) => `- ${r}`).join("\n");
}

function formatKnownData(knownData = {}) {
  return [
    `Producto: ${safe(knownData?.product_interest) || "No definido"}`,
    `Uso: ${safe(knownData?.use_case) || "No definido"}`,
    `Problema: ${safe(knownData?.problem) || "No definido"}`,
    `Presupuesto: ${
      knownData?.budget !== null && knownData?.budget !== undefined
        ? safe(knownData.budget)
        : "No definido"
    }`,
  ].join("\n");
}

export function buildPrompt({
  context,
  catalogResults = [],
  history = [],
  promptConfig = {},
}) {
  const {
    intent = "OTHER",
    stage = "EARLY",
    strategy = "ASK",
    organization,
    assistant,
    known_data = {},
    business_context = {},
    business_rules = {},
    constraints = {},
    user_message = "",
  } = context || {};

  const agentName =
    safe(assistant?.name) ||
    safe(promptConfig?.agent_name) ||
    "Asistente";

  const businessName =
    safe(organization?.business_name) ||
    safe(promptConfig?.business_name) ||
    "el negocio";

  const historyText = formatHistory(history, agentName);
  const catalogText = formatCatalog(catalogResults);
  const knownDataText = formatKnownData(known_data);

  const tone =
    safe(business_rules?.tone) ||
    safe(promptConfig?.tone) ||
    "profesional cercano";

  const emojiPolicy =
    safe(business_rules?.emoji_policy) ||
    "max_1";

  const communicationStyle =
    safe(business_rules?.communication_style) ||
    "concise";

  const closingStyle =
    safe(business_rules?.closing_style) ||
    "soft_close";

  const restrictionsText = formatRestrictions(
    business_rules?.restrictions || []
  );

  const paymentsSinpe =
    safe(business_context?.payments?.sinpe) || "NO DISPONIBLE";

  const paymentsIban =
    safe(business_context?.payments?.iban) || "NO DISPONIBLE";

  const location =
    safe(business_context?.location) || "NO DISPONIBLE";

  const delivery =
    business_context?.delivery?.available === true ? "Sí" : "No";

  const maxLinesEarly = constraints?.max_lines_early || 4;
  const maxLinesDefault = constraints?.max_lines_default || 5;
  const maxEmojis = constraints?.max_emojis || 1;

  const customInstructions = safe(promptConfig?.instructions);

  const isFirstMessage = !history || history.length === 0;

  const systemPrompt = `
Eres ${agentName}, asistente comercial de ${businessName}.

OBJETIVO:
Ayudar al cliente y mover la conversación hacia una acción concreta.
No eres un chatbot informativo. Eres un asistente de ventas.

IDENTIDAD:
- Nombre del asistente: ${agentName}
- Negocio: ${businessName}
- Tono: ${tone}
- Política de emojis: ${emojiPolicy}
- Estilo de comunicación: ${communicationStyle}
- Estilo de cierre: ${closingStyle}

REGLAS CRÍTICAS:
- NUNCA inventes información.
- SOLO usa datos confirmados del negocio y del contexto.
- Si falta información clave, pide confirmación.
- NO repitas preguntas ya respondidas.
- NO des bombazos de información.
- NO uses lenguaje técnico innecesario.
- SIEMPRE termina en pregunta o acción clara.
- Máximo ${maxEmojis} emoji por respuesta.
- En etapa EARLY usa máximo ${maxLinesEarly} líneas.
- En otras etapas usa máximo ${maxLinesDefault} líneas.

RESTRICCIONES DEL NEGOCIO:
${restrictionsText}

ESTRATEGIA OBLIGATORIA: ${strategy}

CUMPLIMIENTO DE ESTRATEGIA:
- ASK: pedir información faltante, no explicar todo todavía.
- QUALIFY: entender necesidad, uso, contexto o presupuesto.
- EXPLAIN: explicar breve, claro y útil, sin saturar.
- RECOMMEND: sugerir opción concreta y breve.
- CLOSE: llevar a acción concreta como compra, visita, coordinación o apartado.
- FOLLOWUP: reactivar sin sonar invasivo.
- EXPLAIN_CLOSE: explicar simple y cerrar a acción.

DATOS DEL NEGOCIO:
- Ubicación: ${location}
- SINPE: ${paymentsSinpe}
- IBAN: ${paymentsIban}
- Envíos disponibles: ${delivery}

INSTRUCCIONES PERSONALIZADAS:
${customInstructions || "Sin instrucciones adicionales"}

REGLA DE APERTURA:
${
  isFirstMessage
    ? `Si es el primer mensaje, puedes iniciar saludando como ${agentName} de ${businessName}.`
    : "Si la conversación ya empezó, no repitas presentación."
}

CONTEXTO ACTUAL:
- Intento: ${intent}
- Etapa: ${stage}

DATOS CONOCIDOS DEL CLIENTE:
${knownDataText}

HISTORIAL RECIENTE:
${historyText || "Sin historial"}

CATÁLOGO RELEVANTE:
${catalogText}

Devuelve solo el texto final que se enviará al cliente.
No agregues etiquetas, JSON, explicaciones ni prefijos.
`.trim();

  const userPrompt = `
Mensaje del cliente:
"${safe(user_message)}"

Responde cumpliendo todas las reglas.
`.trim();

  return {
    systemPrompt,
    userPrompt,
  };
}
