// src/brain/engines/aiEngine.js

import fetch from "node-fetch";

export async function runAI({ context, catalogResults = [] }) {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      console.warn("⚠️ OPENAI_API_KEY no configurada, fallback automático");
      return null;
    }

    const prompt = buildPrompt({ context, catalogResults });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Sos un asistente comercial experto en ventas por WhatsApp. Responde claro, humano y enfocado en cerrar.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    const text =
      data?.choices?.[0]?.message?.content ||
      null;

    if (!text) {
      console.warn("⚠️ AI sin respuesta válida");
      return null;
    }

    return {
      text,
      raw: data,
    };

  } catch (err) {
    console.error("❌ AI ENGINE ERROR:", err);
    return null;
  }
}

/*
========================================
PROMPT BUILDER INTERNO (TEMPORAL)
Luego lo movemos a promptBuilder.js
========================================
*/

function buildPrompt({ context, catalogResults }) {
  const { text } = context;

  let catalogText = "";

  if (catalogResults.length > 0) {
    catalogText = catalogResults
      .slice(0, 3)
      .map((p, i) => `${i + 1}. ${p.name} — ₡${p.price}`)
      .join("\n");
  }

  return `
Cliente escribió:
"${text}"

Productos disponibles:
${catalogText || "No hay productos relevantes"}

Instrucciones:
- Responder como asesor de ventas
- Ser claro y humano
- Guiar a una recomendación
- No inventar productos
- Mantener tono cercano profesional
`;
}
