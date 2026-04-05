function formatProducts(products = []) {
  return products
    .map((p, i) => {
      return `• ${p.name}${p.price ? ` — ₡${p.price}` : ""}`;
    })
    .join("\n");
}

export function generateReply({ text, intent, products = [] }) {
  let finalText = text || "";

  // 🔥 SOLO mostrar productos en cierre real
  if (intent === "CLOSE_INTENT" && products.length > 0) {
    finalText += `\n\n${formatProducts(products)}`;
  }

  // 🎯 CTA dinámico según fase
  if (intent === "BUY") {
    finalText += `\n\n¿Le gustaría contarme qué uso le daría para recomendarle mejor?`;
  }

  if (intent === "CLOSE_INTENT") {
    finalText += `\n\nSi desea, puedo ayudarle a coordinar la compra 😊`;
  }

  return {
    text: finalText.trim(),
    intent,
  };
}
