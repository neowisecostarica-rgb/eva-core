// salesBrain.js — EVA Sales Brain v8
// Rules + Memory + Catalog + AI fallback + Confidence + Stage + CRM Data + Followups

export function detectIntentRule(text = "") {
  const t = text.toLowerCase();

  const hasAny = (...arr) => arr.some(w => t.includes(w));

  if (hasAny("hola", "buenas", "buen día", "buenos días", "buenas tardes", "buenas noches", "hey", "saludos")) {
    return { intent: "GREETING", confidence: 0.95 };
  }

  if (hasAny("no funciona", "daño", "dañada", "problema", "error", "pantalla", "teclado", "batería", "garantía", "reparar", "soporte", "servicio técnico")) {
    return { intent: "SUPPORT", confidence: 0.85 };
  }

  if (
    hasAny(
      "precio",
      "cuánto cuesta",
      "cuanto cuesta",
      "vale",
      "costo",
      "disponible",
      "tiene",
      "tienen",
      "tienes",
      "me interesa",
      "quiero",
      "comprar",
      "apartarlo",
      "apartar",
      "envío",
      "envio",
      "entrega",
      "fotos",
      "modelo",
      "ram",
      "ssd"
    )
  ) {
    return { intent: "BUY", confidence: 0.75 };
  }

  return { intent: "INFO", confidence: 0.55 };
}

export function scoreLead({ intent, text = "" }) {
  const t = text.toLowerCase();
  let score = 0;

  if (intent === "GREETING") score += 10;
  if (intent === "INFO") score += 20;
  if (intent === "SUPPORT") score += 30;
  if (intent === "BUY") score += 45;

  const bump = (cond, pts) => {
    if (cond) score += pts;
  };

  bump(t.includes("precio") || t.includes("cuanto cuesta") || t.includes("cuánto cuesta"), 10);
  bump(t.includes("fotos") || t.includes("foto real") || t.includes("imágenes") || t.includes("imagenes"), 15);
  bump(t.includes("envío") || t.includes("envio") || t.includes("entrega") || t.includes("hoy"), 10);
  bump(t.includes("apart") || t.includes("sinpe") || t.includes("reservo") || t.includes("reservar"), 20);
  bump(t.includes("lo quiero") || t.includes("me lo llevo") || t.includes("comprarlo") || t.includes("comprar ya"), 25);

  if (score > 100) score = 100;
  return score;
}

export function extractBudgetCRC(text = "") {
  const t = text.toLowerCase().replace(/\./g, "").replace(/,/g, "");

  const m1 = t.match(/₡\s?(\d{2,9})/);
  if (m1) return parseInt(m1[1], 10);

  const m2 = t.match(/(\d{2,9})\s?(crc|colones|colón|colon)/);
  if (m2) return parseInt(m2[1], 10);

  const m3 = t.match(/(\d{2,3})\s?mil/);
  if (m3) return parseInt(m3[1], 10) * 1000;

  const m4 = t.match(/(\d{2,3})\s?k/);
  if (m4) return parseInt(m4[1], 10) * 1000;

  return null;
}

export function extractUseCase(text = "") {
  const t = text.toLowerCase();

  if (t.includes("universidad") || t.includes("universitario") || t.includes("estudio") || t.includes("colegio") || t.includes("escuela")) {
    return "study";
  }

  if (t.includes("trabajo") || t.includes("oficina") || t.includes("empresa") || t.includes("excel")) {
    return "work";
  }

  if (t.includes("gaming") || t.includes("juegos") || t.includes("jugar")) {
    return "gaming";
  }

  if (t.includes("diseño") || t.includes("diseno") || t.includes("edición") || t.includes("edicion") || t.includes("arquitectura")) {
    return "creative";
  }

  return null;
}

export function extractUrgency(text = "", leadScore = 0) {
  const t = text.toLowerCase();

  if (
    t.includes("hoy") ||
    t.includes("ya") ||
    t.includes("urgente") ||
    t.includes("de una") ||
    t.includes("lo quiero") ||
    t.includes("me lo llevo")
  ) {
    return "high";
  }

  if (leadScore >= 80) return "high";
  if (leadScore >= 50) return "medium";
  return "low";
}

export async function findCatalogMatches(pool, orgId, text) {
  const q = `%${(text || "").trim()}%`;

  const r = await pool.query(
    `SELECT id, name, category, description, price_crc, stock
     FROM product_catalog
     WHERE organization_id=$1
       AND is_active=true
       AND (
         name ILIKE $2
         OR COALESCE(category,'') ILIKE $2
         OR COALESCE(description,'') ILIKE $2
       )
     ORDER BY
       CASE WHEN stock IS NULL THEN 0 WHEN stock > 0 THEN 1 ELSE 0 END DESC,
       updated_at DESC
     LIMIT 5`,
    [orgId, q]
  );

  return r.rows || [];
}

export async function getProductImages(pool, orgId, productId) {
  const r = await pool.query(
    `SELECT url, label
     FROM product_assets
     WHERE organization_id=$1 AND product_id=$2 AND asset_type='image'
     ORDER BY sort_order ASC, created_at ASC
     LIMIT 6`,
    [orgId, productId]
  );

  return r.rows || [];
}

export async function loadShortHistory(pool, conversationId, limit = 12) {
  const r = await pool.query(
    `SELECT role, content
     FROM messages
     WHERE conversation_id=$1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit]
  );

  return (r.rows || []).reverse().map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content
  }));
}

export async function getOrCreateProfile(pool, { orgId, externalUserId, agentId }) {
  const r = await pool.query(
    `SELECT * FROM customer_profiles
     WHERE organization_id=$1 AND external_user_id=$2
     LIMIT 1`,
    [orgId, externalUserId]
  );

  if (r.rows.length) return r.rows[0];

  const created = await pool.query(
    `INSERT INTO customer_profiles
     (organization_id, external_user_id, agent_id, profile_json)
     VALUES ($1,$2,$3,'{}'::jsonb)
     RETURNING *`,
    [orgId, externalUserId, agentId || null]
  );

  return created.rows[0];
}

export async function updateProfile(pool, { profileId, patch }) {
  await pool.query(
    `UPDATE customer_profiles
     SET profile_json = profile_json || $2::jsonb,
         updated_at = now()
     WHERE id=$1`,
    [profileId, JSON.stringify(patch)]
  );
}

export function buildRuleBasedReply({ intent, text, catalogMatches, leadScore }) {
  const t = (text || "").toLowerCase();

  if (intent === "GREETING") {
    return "¡Hola! 👋 Soy EVA. ¿Qué estás buscando hoy: laptop, reparación o información?";
  }

  if (intent === "SUPPORT") {
    return "Entiendo 🙌 ¿Me contás qué equipo es y qué falla presenta? (modelo + qué está pasando). Si tenés foto o video, mejor.";
  }

  if (intent === "BUY" && catalogMatches?.length) {
    const lines = catalogMatches.map(p => {
      const price = p.price_crc ? `₡${p.price_crc.toLocaleString("es-CR")}` : "Precio: consultar";
      const stock = p.stock === 0 ? " (Agotado)" : "";
      return `• ${p.name}${p.category ? ` (${p.category})` : ""} — ${price}${stock}`;
    });

    if (leadScore >= 85) {
      return `¡Perfecto! 🙌 Tengo estas opciones disponibles:\n${lines.join("\n")}\n\nSi querés, te ayudo a apartar una de una vez o te envío fotos reales del modelo que más te interese.`;
    }

    if (t.includes("foto") || t.includes("fotos") || t.includes("imágenes") || t.includes("imagenes")) {
      return `¡De una! 📸\n\nEstas son opciones disponibles:\n${lines.join("\n")}\n\nDecime cuál te interesa y te envío *fotos reales* de ese modelo.`;
    }

    return `Sí 😊 En este momento tengo estas opciones:\n${lines.join("\n")}\n\n¿La necesitás para *estudio* o *trabajo*? Así te recomiendo la mejor.`;
  }

  if (intent === "BUY") {
    if (leadScore >= 85) {
      return "¡Claro! 🙌 Tengo opciones disponibles. Para avanzar de una vez: ¿la ocupás para estudio o trabajo y cuál rango de presupuesto manejás?";
    }

    return "¡Claro! Para recomendarte bien: ¿la necesitás para *estudio* o *trabajo*? ¿Preferís 8GB o 16GB de RAM?";
  }

  return null;
}

export function shouldUseAI({ intent, confidence, ruleReply }) {
  if (ruleReply) return false;
  if (confidence < 0.65) return true;
  if (intent === "INFO") return true;
  return true;
}

export function buildSystemPrompt({ orgName, profile, intent, leadScore }) {
  const p = profile?.profile_json || {};
  const parts = [];

  parts.push("You are EVA, an intelligent sales assistant.");
  parts.push("Your goal is to convert conversations into sales while being friendly, concise, and commercially smart.");
  parts.push("Always ask only 1 focused question at a time to move the sale forward.");
  parts.push("Do not invent products, prices, availability, or discounts.");
  parts.push("If information is uncertain, ask for clarification instead of inventing.");
  parts.push("Keep replies short, WhatsApp-friendly, and natural in Spanish.");

  if (orgName) parts.push(`You work for organization: ${orgName}.`);

  const mem = [];
  if (p.use_case) mem.push(`use_case: ${p.use_case}`);
  if (p.product_interest) mem.push(`product_interest: ${p.product_interest}`);
  if (p.budget_crc) mem.push(`budget_crc: ${p.budget_crc}`);
  if (p.stage) mem.push(`stage: ${p.stage}`);
  if (p.last_products_shown?.length) mem.push(`last_products_shown: ${p.last_products_shown.join(", ")}`);

  if (mem.length) {
    parts.push("Customer context:");
    parts.push(mem.map(x => `- ${x}`).join("\n"));
  }

  parts.push(`Detected intent: ${intent} (lead_score=${leadScore}).`);
  parts.push("If lead_score >= 85, try to move toward a simple close: reserve, photos, appointment, or delivery coordination.");
  parts.push("Return only the final text reply. Do not add explanations.");

  return parts.join("\n");
}

async function createPendingFollowup(pool, { orgId, conversationId, leadScore }) {
  if (leadScore < 40) return;

  try {
    const existing = await pool.query(
      `SELECT id
       FROM followups
       WHERE organization_id=$1
         AND conversation_id=$2
         AND status='pending'
       ORDER BY scheduled_for DESC
       LIMIT 1`,
      [orgId, conversationId]
    );

    if (existing.rows.length) return;

    let intervalSql = "2 hours";
    if (leadScore >= 85) intervalSql = "1 hour";
    else if (leadScore >= 60) intervalSql = "90 minutes";

    await pool.query(
      `INSERT INTO followups
       (organization_id, conversation_id, status, scheduled_for)
       VALUES ($1,$2,'pending', now() + interval '${intervalSql}')`,
      [orgId, conversationId]
    );
  } catch {
    // Si el schema no coincide, no rompemos el flujo principal.
  }
}

export async function handleInbound({
  pool,
  openai,
  org,
  agentId,
  conversationId,
  externalUserId,
  text,
  channel
}) {
  const { intent, confidence } = detectIntentRule(text);
  const leadScore = scoreLead({ intent, text });

  const profile = await getOrCreateProfile(pool, {
    orgId: org.id,
    externalUserId,
    agentId
  });

  const catalogMatches = await findCatalogMatches(pool, org.id, text);
  const budget = extractBudgetCRC(text);
  const useCase = extractUseCase(text);
  const urgency = extractUrgency(text, leadScore);

  const patch = {};
  if (budget) patch.budget_crc = budget;
  if (useCase) patch.use_case = useCase;
  if (catalogMatches?.length) patch.product_interest = catalogMatches[0].name;

  if (intent === "BUY") {
    patch.stage = leadScore >= 85 ? "CLOSING" : leadScore >= 60 ? "OFFER" : "DISCOVERY";
  } else if (intent === "SUPPORT") {
    patch.stage = "SUPPORT";
  } else if (intent === "GREETING") {
    patch.stage = profile.profile_json?.stage || "DISCOVERY";
  } else {
    patch.stage = profile.profile_json?.stage || "QUALIFYING";
  }

  if (catalogMatches?.length) {
    patch.last_products_shown = catalogMatches.slice(0, 3).map(p => p.name);
  }

  if (Object.keys(patch).length) {
    await updateProfile(pool, { profileId: profile.id, patch });
  }

  const mergedProfile = {
    ...profile,
    profile_json: {
      ...(profile.profile_json || {}),
      ...(patch || {})
    }
  };

  const stage = patch.stage || mergedProfile.profile_json?.stage || "DISCOVERY";

  const data = {
    budget_crc: budget || mergedProfile.profile_json?.budget_crc || null,
    product_interest:
      patch.product_interest ||
      mergedProfile.profile_json?.product_interest ||
      catalogMatches?.[0]?.name ||
      null,
    use_case: useCase || mergedProfile.profile_json?.use_case || null,
    urgency
  };

  try {
    await pool.query(
      `INSERT INTO pipeline_events (organization_id, conversation_id, event_type, payload)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [org.id, conversationId, "INBOUND_INTEL", JSON.stringify({ intent, confidence, leadScore, stage, data })]
    );
  } catch {
    // no romper
  }

  await createPendingFollowup(pool, {
    orgId: org.id,
    conversationId,
    leadScore
  });

  const ruleReply = buildRuleBasedReply({
    intent,
    text,
    catalogMatches,
    leadScore
  });

  const useAI = shouldUseAI({ intent, confidence, ruleReply });

  if (!useAI && ruleReply) {
    return {
      reply: ruleReply,
      intent,
      confidence,
      leadScore,
      stage,
      data,
      catalogMatches
    };
  }

  const history = await loadShortHistory(pool, conversationId, 12);

  const systemPrompt = buildSystemPrompt({
    orgName: org.name || null,
    profile: mergedProfile,
    intent,
    leadScore
  });

  const ai = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: text }
    ]
  });

  const reply =
    ai.choices?.[0]?.message?.content?.trim() ||
    "Perfecto. ¿Me confirmás un poquito más para ayudarte mejor?";

  try {
    const usage = ai.usage || {};
    await pool.query(
      `INSERT INTO eva_usage (organization_id, conversation_id, model, prompt_tokens, completion_tokens, total_tokens)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        org.id,
        conversationId,
        "gpt-4o-mini",
        usage.prompt_tokens || 0,
        usage.completion_tokens || 0,
        usage.total_tokens || 0
      ]
    );
  } catch {
    // no romper
  }

  return {
    reply,
    intent,
    confidence,
    leadScore,
    stage,
    data,
    catalogMatches
  };
}
