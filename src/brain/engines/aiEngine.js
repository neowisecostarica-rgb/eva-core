// src/brain/engines/aiEngine.js

export async function runAI({ prompt }) {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY NO CONFIGURADA");
      return null;
    }

    if (!prompt || !Array.isArray(prompt)) {
      throw new Error("Invalid prompt format (expected messages array)");
    }

    console.log("🧠 AI START");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: prompt, // ✅ FIX CLAVE
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    clearTimeout(timeout);

    const rawText = await response.text();

    console.log("🧠 OPENAI RAW:", rawText);

    let data;

    try {
      data = JSON.parse(rawText);
    } catch (err) {
      console.error("❌ JSON PARSE ERROR:", err);
      return null;
    }

    if (!response.ok) {
      console.error("❌ OPENAI STATUS ERROR:", data);
      return null;
    }

    const text =
      data?.choices?.[0]?.message?.content?.trim() || null;

    if (!text) {
      console.warn("⚠️ AI RESPUESTA VACÍA:", data);
      return null;
    }

    console.log("✅ AI RESPONSE OK");

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
