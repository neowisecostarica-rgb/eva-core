/*
====================================================
EVA CORE — PROMPT BUILDER (BUSINESS HARD CONTROL vNEXT.2)
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
    promptConfig?.assistant_name ||
    "Asistente";

  const businessName =
    organization?.business_name ||
    promptConfig?.business_name ||
    "el negocio";

  const customInstructions = promptConfig?.instructions || "";

  /*
  ====================================================
  🔥 BUSINESS CONTEXT — PRIORIDAD MÁXIMA
  ====================================================
  */

  const businessBlock = `
===== DATOS REALES DEL NEGOCIO (FUENTE DE VERDAD) =====

Estos datos SON CORRECTOS y representan la operación real.
No puedes ignorarlos ni contradecirlos.

PAGOS:
- SINPE: ${business_context?.payments?.sinpe ?? "NO REGISTRADO"}
- Banco: ${business_context?.payments?.bank_name ?? "NO REGISTRADO"}
- Cuenta: ${business_context?.payments?.account_colones ?? "NO REGISTRADA"}
- IBAN: ${business_context?.payments?.iban_colones ?? "NO REGISTRADO"}
- Tarjeta: ${
    business_context?.payments?.accepts_card === true ? "Sí" : "No"
  }

OPERACIÓN:
- Envíos: ${
    business_context?.operations?.delivery === true ? "Sí" : "No"
  }
- Retiro: ${
    business_context?.operations?.pickup === true ? "Sí" : "No"
  }

UBICACIÓN:
- Dirección: ${business_context?.location?.address ?? "NO REGISTRADA"}

REGLA CRÍTICA:
Si el cliente pregunta por pagos, SINPE, envíos o ubicación:
→ DEBES responder usando estos datos
→ Está PROHIBIDO inventar otra respuesta
`;

  /*
  ====================================================
  HISTORY
  ====================================================
  */

  const historyText = history
    .slice(-8)
    .map((m) => {
      const roleLabel = m.role === "user" ? "Cliente" : agentName;
      return `${roleLabel}: ${m.content || m.text || ""}`;
    })
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
              `${i + 1}. ${p?.name || "Producto"} — ₡${
                p?.price || "N/A"
              }`
          )
          .join("\n")
      : "Sin productos relevantes.";

  /*
  ====================================================
  MEMORY
  ====================================================
  */

  const memoryRules = `
- No repitas preguntas ya respondidas
- Usa el contexto previo del cliente
`;

  /*
  ====================================================
  STYLE
  ====================================================
  */

  const styleRules = `
- Máximo 1 emoji
- Respuestas claras
- No responder más de lo necesario
`;

  /*
  ====================================================
  FINAL
  ====================================================
  */

  return `
${businessBlock}

${memoryRules}

${styleRules}

${customInstructions}

Empresa: ${businessName}
Asistente: ${agentName}
Intent: ${intent}
Stage: ${stage}
Strategy: ${strategy}

Datos cliente:
${JSON.stringify(known_data, null, 2)}

Historial:
${historyText || "Sin historial"}

Productos:
${catalogText}

Mensaje:
"${context.user_message}"

Responde correctamente usando los datos del negocio cuando aplique.
`;
}
