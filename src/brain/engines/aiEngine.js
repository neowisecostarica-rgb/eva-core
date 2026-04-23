/*
====================================================
EVA CORE — AI ENGINE (CONTROLLED vNEXT FINAL)
====================================================
*/

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
====================================================
SANITIZER
====================================================
*/

function sanitizeOutput(text = "") {
  if (!text) return null;

  let clean = String(text).trim();

  // eliminar prefijos raros
  clean = clean.replace(/^(asistente|assistant|eva)\s*:\s*/gi, "");

  return clean;
}

/*
====================================================
MAIN AI RUNNER
====================================================
*/

export async function runAI({ prompt = [], metadata = {} }) {
  try {
    if (!prompt || !Array.isArray(prompt)) {
      throw new Error("Invalid prompt format");
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: prompt,
      temperature: 0.4, // 🔒 controlado (menos creatividad, más consistencia)
      max_tokens: 180,
    });

    const text =
      response?.choices?.[0]?.message?.content || null;

    const cleaned = sanitizeOutput(text);

    return {
      text: cleaned,
      raw: text,
      metadata,
    };
  } catch (err) {
    console.error("❌ AI ENGINE ERROR:", err);

    return {
      text: null,
      error: true,
    };
  }
}
