/*
====================================================
EVA CORE — PROMPT BUILDER (BUSINESS SOT ENFORCED vNEXT.1)
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
          .map((p, i) => {
            const name = p?.name || "Producto";
            const price = p?.price ? `₡${p.price}` : "Precio no disponible";
            return `${i + 1}. ${name} — ${price}`;
          })
          .join("\n")
      : "No hay productos disponibles para esta consulta.";

  /*
  ====================================================
  BUSINESS SOT — CRÍTICO
  ====================================================
  */

  const businessCriticalBlock = `
INFORMACIÓN CRÍTICA DEL NEGOCIO (FUENTE OFICIAL Y OBLIGATORIA)

Estos datos pertenecen al negocio real.
Debes usarlos como verdad operativa.
Ignorar estos datos, contradecirlos o inventar otros datos es un error.

REGLA ABSOLUTA:
Si el cliente pregunta por:
- pagos
- SINPE
- transferencia
- tarjeta
- envíos
- retiro
- ubicación
- horario
- garantía

Entonces:
1. Busca la respuesta en los DATOS OFICIALES DEL NEGOCIO
2. Responde usando esos datos
3. Está prohibido inventar otra respuesta
4. Está prohibido decir "no tengo información" si el dato sí aparece abajo
5. Si el dato NO aparece abajo, dilo con honestidad y ofrece verificarlo
`;

  /*
  ====================================================
  BUSINESS CONTEXT
  ====================================================
  */

  const businessBlock = `
DATOS OFICIALES DEL NEGOCIO

Nombre del negocio:
${business_context?.name ?? businessName ?? "NO REGISTRADO"}

Tipo de negocio:
${business_context?.type ?? "NO REGISTRADO"}

Teléfono del negocio:
${business_context?.phone ?? "NO REGISTRADO"}

UBICACIÓN OFICIAL:
- Dirección: ${business_context?.location?.address ?? "NO REGISTRADA"}
- Ciudad: ${business_context?.location?.city ?? "NO REGISTRADA"}
- País: ${business_context?.location?.country ?? "NO REGISTRADO"}
- Google Maps: ${business_context?.location?.maps ?? "NO REGISTRADO"}

PAGOS OFICIALES:
- SINPE OFICIAL: ${business_context?.payments?.sinpe ?? "NO REGISTRADO"}
- Banco oficial: ${business_context?.payments?.bank_name ?? "NO REGISTRADO"}
- Cuenta colones oficial: ${business_context?.payments?.account_colones ?? "NO REGISTRADA"}
- IBAN colones oficial: ${business_context?.payments?.iban_colones ?? "NO REGISTRADO"}
- Cuenta USD oficial: ${business_context?.payments?.account_usd ?? "NO REGISTRADA"}
- IBAN USD oficial: ${business_context?.payments?.iban_usd ?? "NO REGISTRADO"}
- Titular oficial: ${business_context?.payments?.owner ?? "NO REGISTRADO"}
- Acepta tarjeta: ${
    business_context?.payments?.accepts_card === true
      ? "Sí"
      : business_context?.payments?.accepts_card === false
      ? "No"
      : "NO REGISTRADO"
  }

OPERACIÓN OFICIAL:
- Hace envíos: ${
    business_context?.operations?.delivery === true
      ? "Sí"
      : business_context?.operations?.delivery === false
      ? "No"
      : "NO REGISTRADO"
  }
- Permite retiro: ${
    business_context?.operations?.pickup === true
      ? "Sí"
      : business_context?.operations?.pickup === false
      ? "No"
      : "NO REGISTRADO"
  }
- Horarios: ${
    business_context?.operations?.hours
      ? JSON.stringify(business_context.operations.hours)
      : "NO REGISTRADOS"
  }

POLÍTICAS OFICIALES:
- Garantía: ${business_context?.policies?.warranty ?? "NO REGISTRADA"}
- Política de envíos: ${business_context?.policies?.shipping ?? "NO REGISTRADA"}

NOTAS COMERCIALES:
${business_context?.commercial?.notes ?? "SIN NOTAS"}
`;

  /*
  ====================================================
  MEMORY ENFORCEMENT
  ====================================================
  */

  const memoryRules = `
REGLA DE MEMORIA Y CONTINUIDAD

- Debes leer el historial antes de responder
- No vuelvas a preguntar algo que el cliente ya respondió
- Si el cliente ya indicó uso, presupuesto, producto o problema, usa ese dato para avanzar
- Si el cliente corrige algo, reconoce la corrección y continúa
- No repitas preguntas innecesarias
`;

  /*
  ====================================================
  IDENTITY
  ====================================================
  */

  const isFirstMessage = !history || history.length === 0;

  const identityBlock = isFirstMessage
    ? `Si es el primer mensaje real de la conversación, puedes presentarte de forma natural como ${agentName} de ${businessName}.`
    : `No repitas presentación. Continúa la conversación según el contexto acumulado.`;

  /*
  ====================================================
  STRATEGY
  ====================================================
  */

  const strategyBlock = `
ESTRATEGIA ACTUAL: ${strategy || "DEFAULT"}

Reglas por estrategia:
- ASK / QUALIFY: pregunta lo necesario para avanzar
- RECOMMEND: recomienda según el contexto del cliente
- CLOSE: empuja a una acción concreta
- FOLLOWUP: reactiva con contexto
- EXPLAIN: explica de forma simple
`;

  /*
  ====================================================
  STYLE / LENGTH CONTROL
  ====================================================
  */

  const styleRules = `
REGLAS DE COMUNICACIÓN

- Máximo 1 emoji por mensaje
- Lenguaje claro, humano y comercial
- No sonar robótico
- No usar lenguaje técnico innecesario
- Siempre buscar avanzar la conversación

CONTROL DE LONGITUD:
- Si la etapa es EARLY: respuesta corta y enfocada
- Si la etapa es QUALIFYING o MID: respuesta breve o media según necesidad
- Si la etapa es HOT o CLOSE: puedes responder con más detalle si ayuda a cerrar
- No recortes información crítica del negocio cuando el cliente pregunte por pagos, envíos, ubicación, horarios o garantía
`;

  /*
  ====================================================
  ANTI-HALLUCINATION
  ====================================================
  */

  const antiHallucinationBlock = `
REGLAS ANTI-INVENCIÓN

- No inventes productos, precios, ubicaciones, políticas ni métodos de pago
- No contradigas el historial
- No contradigas los datos oficiales del negocio
- Si no sabes algo y no aparece en contexto, dilo con honestidad
- Si el cliente pregunta algo transaccional, prioriza exactitud sobre creatividad
`;

  /*
  ====================================================
  FINAL
  ====================================================
  */

  return `
${identityBlock}

${businessCriticalBlock}

${memoryRules}

${strategyBlock}

${styleRules}

${antiHallucinationBlock}

${customInstructions}

CONTEXTO GENERAL
- Empresa: ${businessName}
- Asistente: ${agentName}
- Intent actual: ${intent || "UNKNOWN"}
- Stage actual: ${stage || "EARLY"}

${businessBlock}

DATOS CONOCIDOS DEL CLIENTE
${JSON.stringify(known_data, null, 2)}

HISTORIAL RECIENTE
${historyText || "Sin historial"}

PRODUCTOS RELEVANTES
${catalogText}

MENSAJE ACTUAL DEL CLIENTE
"${context?.user_message || ""}"

INSTRUCCIÓN FINAL
Responde de forma coherente con el historial y usando los datos oficiales del negocio cuando aplique.
Si el cliente pregunta por pagos, SINPE, envíos, retiro, ubicación, horario o garantía, responde con los datos oficiales del negocio.
`;
}
