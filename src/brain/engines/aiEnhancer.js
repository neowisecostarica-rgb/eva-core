/*
====================================================
EVA AI ENHANCER
Conversational Intelligence Layer
====================================================

Este módulo mejora las respuestas generadas
por EVA sin cambiar su intención comercial.

Responsabilidades:

• mejorar redacción
• hacer tono más natural
• mantener intención de venta
• evitar alterar precios o datos

====================================================
*/

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/*
====================================================
PROMPT
====================================================
*/

const SYSTEM_PROMPT = `
Eres una asistente comercial profesional.

Tu tarea es mejorar el mensaje que te entrego
sin cambiar su significado.

Reglas estrictas:

- No inventes información
- No cambies precios
- No cambies productos
- No cambies números
- Solo mejora la forma de hablar

Estilo:

- humano
- claro
- amable
- orientado a ventas

Responde únicamente con el mensaje mejorado.
`;

/*
====================================================
ENHANCE REPLY
====================================================
*/

export async function enhanceReply(message) {

  try {

    if (!message || message.length < 15) {
      return message;
    }

    const completion = await openai.chat.completions.create({

      model: "gpt-4o-mini",

      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: message
        }
      ],

      temperature: 0.4

    });

    const improved = completion.choices?.[0]?.message?.content;

    if (!improved) {
      return message;
    }

    return improved.trim();

  } catch (err) {

    console.error("AI ENHANCER ERROR", err);

    return message;

  }

}
