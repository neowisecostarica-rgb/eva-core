export async function generateReply({
  intent,
  catalogMatches,
  interestLevel,
  objection,
  closingIntent,
  score,
  stage
}) {

  let response;

  // 1. GREETING
  if (intent === "GREETING") {
    response = greetingReply();
  }

  // 2. OBJECIONES
  else if (objection) {
    response = objectionReply({ objection }) || fallbackReply();
  }

  // 3. CIERRE DIRECTO
  else if (closingIntent) {
    response = closingReply({ catalogMatches });
  }

  // 4. BUY FLOW
  else if (intent === "BUY") {
    response = buyReplyByStage({ catalogMatches, stage });
  }

  // 🔥 5. SI HAY PRODUCTOS → USARLOS SIEMPRE
  else if (catalogMatches && catalogMatches.length > 0) {
    response = productReply({ catalogMatches, interestLevel });
  }

  // 🔥 6. LEAD CALIENTE SIN BUY EXPLÍCITO
  else if (score >= 70) {
    response = productReply({ catalogMatches, interestLevel });
  }

  // 7. FALLBACK
  else {
    response = fallbackReply();
  }

  try {
    if (response?.text) {
      response.text = await enhanceReply(response.text);
    }
  } catch (err) {
    console.error("reply ai enhance error", err);
  }

  return response;

}
