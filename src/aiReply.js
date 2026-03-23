console.log("🧠 AI RESPONSE:", data);

export async function generateAIReply({
  text,
  stage,
  intent,
  entities,
  summary
}) {
  try {
    const prompt = `
Eres Eva, una asesora de ventas experta en laptops reacondicionadas en Costa Rica.

Contexto de la conversación:
- Etapa: ${stage}
- Intención: ${intent}
- Entidades: ${JSON.stringify(entities)}
- Historial: ${summary}

Mensaje del cliente:
"${text}"

Responde de forma natural, humana y enfocada en ventas.

Reglas:
- No sonar robótica
- Máximo 2 emojis
- Siempre guiar hacia una acción (compra, recomendación, visita)
- No explicar reparaciones técnicas
- Tono cercano pero profesional
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Eres una asesora de ventas experta." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();

    return data.choices?.[0]?.message?.content || null;

  } catch (error) {
    console.error("❌ AI ERROR:", error.message);
    return null;
  }
}
