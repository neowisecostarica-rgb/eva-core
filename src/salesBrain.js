export async function handleInbound({
  organization_id,
  phone,
  text,
  conversation_id = null
}) {
  console.log("📩 INBOUND:", { phone, text });

  try {
    const intent = detectIntent(text);
    const greetingOnly = isGreeting(text);

    console.log("🧠 INTENT:", intent);

    /*
    ====================================================
    SEARCH PRODUCTS
    ====================================================
    */

    let products = [];

    try {
      products = await searchCatalog({
        organization_id,
        text
      });

      console.log("📦 PRODUCTS FOUND:", products?.length || 0);
    } catch (err) {
      console.error("❌ SEARCH CATALOG ERROR:", err.message);
      products = [];
    }

    /*
    ====================================================
    PRODUCT FLOW (PRIORIDAD 1)
    ====================================================
    */

    if (products && products.length > 0) {
      console.log("🟢 PRODUCT FLOW");

      try {
        const reply = generateReply({
          text,
          intent,
          products
        });

        if (reply?.text) {
          return {
            reply: reply.text,
            media: reply.media || []
          };
        }
      } catch (err) {
        console.error("❌ GENERATE REPLY ERROR:", err);
      }
    }

    /*
    ====================================================
    GREETING INTELIGENTE (NO GENÉRICO)
    ====================================================
    */

    if (greetingOnly) {
      return {
        reply:
          "Hola 😊 con mucho gusto te ayudo 🙌\n\nContame, ¿estás buscando algún equipo en específico o sería para estudio, trabajo o algo más exigente?",
        media: []
      };
    }

    /*
    ====================================================
    INTENT-BASED RESPONSE (VENTA REAL)
    ====================================================
    */

    if (intent === "PRICE") {
      return {
        reply:
          "Claro 😊 con gusto te ayudo con eso 🙌\n\n¿Me podés contar cuál modelo viste o qué tipo de equipo estás buscando? Así te doy el precio exacto 👍",
        media: []
      };
    }

    if (intent === "BUY") {
      return {
        reply:
          "Perfecto 🙌 con gusto te ayudo a encontrar la mejor opción 😊\n\nContame, ¿para qué uso la necesitás y qué presupuesto tenés pensado más o menos?",
        media: []
      };
    }

    if (intent === "PRODUCT_SEARCH") {
      return {
        reply:
          "Claro 😊 tenemos varias opciones disponibles 🙌\n\nPara recomendarte bien, ¿la necesitás para estudio, oficina o algo más exigente?",
        media: []
      };
    }

    /*
    ====================================================
    FALLBACK DINÁMICO (NO ROBÓTICO)
    ====================================================
    */

    return {
      reply:
        "Claro 😊 contame un poquito más sobre lo que estás buscando 🙌 así te ayudo mejor y te recomiendo una buena opción 👍",
      media: []
    };

  } catch (err) {
    console.error("❌ HANDLE INBOUND ERROR:", err);

    return {
      reply: "Hubo un error procesando tu mensaje.",
      media: []
    };
  }
}
