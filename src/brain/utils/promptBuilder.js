// src/brain/utils/promptBuilder.js

export function buildPrompt({ context, catalogResults = [], config = {} }) {
  try {
    const {
      text,
      phone,
      organization_id,
    } = context;

    /*
    ========================================
    1. CONFIG DEL NEGOCIO (MULTI-TENANT)
    ========================================
    */

    const {
      business_name = "este negocio",
      tone = "profesional cercano",
      objective = "ayudar y guiar al cliente hacia una compra",
      language = "es",
      assistant_name = "Asistente",
    } = config;

    /*
    ========================================
    2. CATÁLOGO
    ========================================
    */

    let catalogText = "No hay productos relevantes";

    if (catalogResults.length > 0) {
      catalogText = catalogResults
        .slice(0, 3)
        .map((p, i) => `${i + 1}. ${p.name} — ₡${p.price}`)
        .join("\n");
    }

    /*
    ========================================
    3. INSTRUCCIONES BASE EVA
    ========================================
    */

    const instructions = `
Sos ${assistant_name}, asistente comercial de ${business_name}.

Tu objetivo es: ${objective}.

Tono:
- ${tone}
- claro y humano
- enfocado en ayudar
- orientado a cerrar ventas

Reglas:
- No decir "no sé"
- No inventar productos
- Guiar la conversación
- Mantener mensajes claros y útiles
- No usar lenguaje técnico complejo
`;

    /*
    ========================================
    4. CONTEXTO DEL CLIENTE
    ========================================
    */

    const userContext = `
Cliente escribió:
"${text}"

Canal: WhatsApp
Cliente ID: ${phone}
`;

    /*
    ========================================
    5. CONTEXTO DE PRODUCTOS
    ========================================
    */

    const productContext = `
Productos disponibles:
${catalogText}
`;

    /*
    ========================================
    6. PROMPT FINAL
    ========================================
    */

    const prompt = `
${instructions}

${userContext}

${productContext}

Responde en español.
Respuesta:
`;

    return prompt.trim();

  } catch (err) {
    console.error("❌ PROMPT BUILDER ERROR:", err);
    return null;
  }
}
