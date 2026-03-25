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
            content: prompt,
          }
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    const text =
      data?.choices?.[0]?.message?.content || null;

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
