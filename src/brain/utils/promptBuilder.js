/*
====================================================
EVA CORE — PROMPT BUILDER (CONTROLLED EXPANSION vNEXT)
====================================================
*/

export function buildPrompt({
  context,
  catalogResults = [],
  history = [],
  promptConfig = {},
}) {
  const {
    intent,
    stage,
    strategy,
    organization,
    assistant,
    known_data = {},
    business_context = {},
  } = context || {};

  const agentName =
    assistant?.name ||
    promptConfig?.agent_name ||
    "Asistente";

  const businessName =
    organization?.business_name ||
    promptConfig?.business_name ||
    "el negocio";

  const customInstructions = promptConfig?.instructions || "";

  /*
  ====================================================
  HISTORY
  ====================================================
  */

  const historyText = history
    .slice(-6)
    .map((m) =>
      `${m.role === "user" ? "Cliente" : agentName}: ${
        m.content || m.text || ""
      }`
    )
    .join("\n");

  /*
  ====================================================
  CATÁLOGO
  ====================================================
  */

  const catalogText =
    catalogResults.length > 0
      ? catalogResults
          .slice(0, 5)
          .map(
            (p, i) =>
              `${i + 1}. ${p.name || "Producto"} — ₡${
                p.price || ""
              }`
          )
          .join("\n")
      : "No hay productos disponibles para esta consulta.";

  /*
  ====================================================
  🔥 SOT FUERTE (MEJORADO)
  ====================================================
  */

  const sotRules = `
REGLAS CRÍTICAS (NO ROMPER):

1. La información del negocio es la única fuente válida
2. NUNCA contradigas esos datos
3. NUNCA inventes información
4. Si NO tienes un dato → dilo claramente (no lo inventes)

CASOS CRÍTICOS:
- pagos
- envíos
- ubicación
- horarios
- garantía

→ RESPONDE SOLO con datos del negocio
→ Si falta información → pide confirmación
`;

  /*
  ====================================================
  🔥 CONTROL DE MEMORIA (NUEVO)
  ====================================================
  */

  const memoryRules = `
REGLA DE MEMORIA:

- NO vuelvas a preguntar información que ya el cliente dio
- Usa los datos ya conocidos para avanzar
- Si el cliente repite molestia → corrige tu comportamiento
`;

  /*
  ====================================================
  🔥 BUSINESS CONTEXT
  ====================================================
  */

  const businessBlock = `
DATOS OFICIALES DEL NEGOCIO:

Ubicación:
Dirección: ${business_context?.location?.address || "NO DISPONIBLE"}

Pagos:
SINPE: ${business_context?.payments?.sinpe || "NO DISPONIBLE"}
Banco: ${business_context?.payments?.bank_name || "NO DISPONIBLE"}
Cuenta: ${business_context?.payments?.account_colones || "NO DISPONIBLE"}
IBAN: ${business_context?.payments?.iban_colones || "NO DISPONIBLE"}
Tarjeta: ${business_context?.payments?.accepts_card ? "Sí" : "No"}

Operación:
Envíos: ${business_context?.operations?.delivery ? "Sí" : "No"}
Retiro: ${business_context?.operations?.pickup ? "Sí" : "No"}
`;

  /*
  ====================================================
  🔥 CONTROL DE LONGITUD DINÁMICO (CLAVE)
  ====================================================
  */

  const lengthControl = `
CONTROL DE RESPUESTA:

- EARLY → respuestas cortas + pregunta
- MID → explicación breve + guía
- HOT → puede ser más completo + cierre

NUNCA saturar con información innecesaria
`;

  /*
  ====================================================
  IDENTITY
  ====================================================
  */

  const isFirstMessage =
    !history || history.length === 0;

  const identityBlock =
    isFirstMessage
      ? `Inicia SIEMPRE: "Hola 😊 le saluda ${agentName} de ${businessName}."`
      : `Continúa la conversación sin repetir presentación`;

  /*
  ====================================================
  STRATEGY
  ====================================================
  */

  const strategyBlock = `
Estrategia actual: ${strategy}

Acción:
- ASK → preguntar
- QUALIFY → entender
- RECOMMEND → sugerir
- CLOSE → cerrar
`;

  /*
  ====================================================
  FINAL
  ====================================================
  */

  return `
${identityBlock}

${sotRules}

${memoryRules}

${strategyBlock}

${lengthControl}

${customInstructions}

Contexto:
Empresa: ${businessName}

${businessBlock}

Datos cliente:
${JSON.stringify(known_data, null, 2)}

Historial:
${historyText || "Sin historial"}

Productos:
${catalogText}

Mensaje:
"${context.user_message}"

Responde de forma inteligente y coherente.
`;
}
