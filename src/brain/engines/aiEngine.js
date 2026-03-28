// src/brain/engines/aiEngine.js

import fetch from "node-fetch";

export async function runAI({ prompt }) {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      console.warn("⚠️ OPENAI_API_KEY no configurada, fallback automático");
      return null;
    }

    if (!prompt) {
      throw new Error("Missing prompt");
    }

    /*
    ========================================
    REQUEST
    ========================================
    */

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",

        messages: [
          {
            role: "system",
            content:
              "Eres un asistente comercial experto en ventas por WhatsApp. Responde claro, humano, breve y siempre cierra con una acción.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    clearTimeout(timeout);

    /*
    ========================================
    RESPONSE VALIDATION
    ========================================
    */

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ OPENAI ERROR:", errorText);
      return null;
    }

    const data = await response.json();

    const text =
      data?.choices?.[0]?.message?.content?.trim() || null;

    if (!text) {
      console.warn("⚠️ AI sin respuesta válida");
      return null;
    }

    return {
      text,
      raw: data,
    };

  } catch (err) {
    if (err.name === "AbortError") {
      console.error("⏱️ AI TIMEOUT");
    } else {
      console.error("❌ AI ENGINE ERROR:", err);
    }

    return null;
  }
}
