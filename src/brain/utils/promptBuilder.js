export function buildPrompt({ context, catalogResults, history = [], config }) {
  const { text } = context;

  const businessName = config?.business_name || "Compu Store";
  const assistantName = config?.assistant_name || "Eva";

  const hasProducts = catalogResults && catalogResults.length > 0;

  /*
  ========================================
  CONTROL BÁSICO DE INTENCIÓN (LIGERO)
  ========================================
  */

  const lower = (text || "").toLowerCase();

  const isGreeting =
    lower.includes("hola") ||
    lower.includes("buenas") ||
    lower.length <= 5;

  const isGratitude =
    lower.includes("gracias") ||
    lower.includes("graciss");

  const allowSelling = !isGreeting && !isGratitude;

  /*
  ========================================
  HISTORIAL
  ========================================
  */

  const historyText = history
    .map((m) => `${m.role === "user" ? "Cliente" : "Asistente"}: ${m.text}`)
    .join("\n");

  /*
  ========================================
  PROMPT
  ========================================
  */

  return `
Eres ${assistantName}, asistente comercial de ${businessName}.

Tu objetivo es ayudar al cliente y guiarlo hacia una compra de forma natural.

========================================
REGLAS
========================================

- Habla como humano (WhatsApp)
- Máximo 1 emoji
- Sé claro y directo
- No suenes forzado ni agresivo
- No ignores el contexto del mensaje

========================================
COMPORTAMIENTO
========================================

${
  allowSelling
    ? `
- El cliente muestra intención → puedes recomendar productos
- Guía hacia una decisión
- Puedes hacer 1 pregunta para afinar
`
    : `
- El cliente NO ha mostrado intención clara
- NO vendas en este mensaje
- Responde natural
- Haz una pregunta para entender qué busca
`
}

========================================
PRODUCTOS
========================================

${
  hasProducts && allowSelling
    ? `
- Usa los productos como apoyo para vender
- No fuerces la venta
`
    : `
- No menciones productos todavía
`
}

========================================
HISTORIAL
========================================

${historyText || "Sin historial"}

========================================
MENSAJE
========================================

"${text}"

Responde como asesor humano experto.
`;
}
