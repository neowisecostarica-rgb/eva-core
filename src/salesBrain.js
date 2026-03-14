import pool from "./db.js";

/*
====================================================
NORMALIZATION
====================================================
*/

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizePhone(phone = "") {
  return String(phone).replace(/\D/g, "");
}

function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map((v) => String(v).trim()))];
}

function addOpportunity(opportunities, value) {
  if (!value) return opportunities;
  if (!opportunities.includes(value)) opportunities.push(value);
  return opportunities;
}

/*
====================================================
SIGNAL DETECTION
====================================================
*/

function detectIntent(text) {
  const t = normalizeText(text);

  if (
    t.includes("quiero comprar") ||
    t.includes("la quiero") ||
    t.includes("me interesa para comprar") ||
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("transferencia") ||
    t.includes("apartar") ||
    t.includes("apartarla") ||
    t.includes("se puede apartar") ||
    t.includes("me la deja") ||
    t.includes("quiero esa") ||
    t.includes("me la reservo") ||
    t.includes("reservarla")
  ) {
    return "CLOSE_INTENT";
  }

  if (
  t.includes("precio") ||
  t.includes("cuanto cuesta") ||
  t.includes("cuanto vale") ||
  t.includes("disponible") ||
  t.includes("me interesa") ||
  t.includes("tienen") ||
  t.includes("busco") ||
  t.includes("ocupo") ||
  t.includes("andan buscando") ||
  t.includes("tiene disponibles") ||
  t.includes("quiero una laptop") ||
  t.includes("quiero laptop") ||
  t.includes("necesito laptop") ||
  t.includes("necesito una laptop") ||
  t.includes("quiero una computadora") ||
  t.includes("necesito computadora") ||
  t.includes("quiero comprar laptop")
) {
  return "BUY";
}


  if (
    t.includes("garantia") ||
    t.includes("procesador") ||
    t.includes("ram") ||
    t.includes("ssd") ||
    t.includes("especificaciones") ||
    t.includes("caracteristicas") ||
    t.includes("informacion") ||
    t.includes("info") ||
    t.includes("cuenteme") ||
    t.includes("detalle")
  ) {
    return "INFO";
  }

  if (
    t.includes("mantenimiento") ||
    t.includes("reparacion") ||
    t.includes("revisión") ||
    t.includes("revision") ||
    t.includes("no imprime") ||
    t.includes("no enciende") ||
    t.includes("esta lenta") ||
    t.includes("esta muy lenta") ||
    t.includes("falla")
  ) {
    return "SUPPORT";
  }

  if (
    t.includes("hola") ||
    t.includes("buenas") ||
    t.includes("buenos dias") ||
    t.includes("buen dia") ||
    t.includes("buenas tardes") ||
    t.includes("buenas noches")
  ) {
    return "GREETING";
  }

  return "UNKNOWN";
}

function detectPipelineEvent(text) {
  const t = normalizeText(text);

  if (
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("transferencia")
  ) {
    return "PAYMENT_INTENT";
  }

  if (
    t.includes("quiero comprar") ||
    t.includes("la quiero") ||
    t.includes("apartar") ||
    t.includes("apartarla") ||
    t.includes("me la deja") ||
    t.includes("reservar") ||
    t.includes("se puede apartar") ||
    t.includes("quiero esa")
  ) {
    return "READY_TO_BUY";
  }

  if (
    t.includes("es nueva") ||
    t.includes("muy cara") ||
    t.includes("muy caro") ||
    t.includes("por que tan barata") ||
    t.includes("porque tan barata")
  ) {
    return "OBJECTION_PRICE";
  }

  if (t.includes("garantia") || t.includes("tiene garantia")) {
    return "WARRANTY_REQUEST";
  }

  if (
    t.includes("fotos") ||
    t.includes("imagenes") ||
    t.includes("imagenes reales") ||
    t.includes("mandeme fotos") ||
    t.includes("mandame fotos") ||
    t.includes("fotos reales")
  ) {
    return "CATALOG_REQUEST";
  }

  if (
    t.includes("precio") ||
    t.includes("cuanto cuesta") ||
    t.includes("cuanto vale") ||
    t.includes("cuanto sale")
  ) {
    return "PRICE_REQUEST";
  }

  if (
    t.includes("mantenimiento") ||
    t.includes("servicio tecnico") ||
    t.includes("no imprime") ||
    t.includes("reparacion")
  ) {
    return "SERVICE_REQUEST";
  }

  if (
    t.includes("hola") ||
    t.includes("buenas") ||
    t.includes("buenos dias") ||
    t.includes("buen dia")
  ) {
    return "GREETING";
  }

  return "QUESTION";
}

function detectUseCase(text) {
  const t = normalizeText(text);

  if (
    t.includes("estudio") ||
    t.includes("escuela") ||
    t.includes("colegio") ||
    t.includes("universidad") ||
    t.includes("clases") ||
    t.includes("tareas")
  ) {
    return "estudio";
  }

  if (
    t.includes("trabajo") ||
    t.includes("oficina") ||
    t.includes("empresa") ||
    t.includes("excel") ||
    t.includes("administrativo") ||
    t.includes("teletrabajo")
  ) {
    return "trabajo";
  }

  if (
    t.includes("diseno") ||
    t.includes("edicion") ||
    t.includes("arquitectura") ||
    t.includes("photoshop") ||
    t.includes("illustrator") ||
    t.includes("autocad")
  ) {
    return "diseno";
  }

  if (
    t.includes("gaming") ||
    t.includes("juegos") ||
    t.includes("gamer")
  ) {
    return "gaming";
  }

  return null;
}

function detectProductInterest(text) {
  const t = normalizeText(text);

  if (
    t.includes("laptop") ||
    t.includes("computadora") ||
    t.includes("portatil") ||
    t.includes("notebook")
  ) {
    return "laptop";
  }

  if (t.includes("impresora")) {
    return "impresora";
  }

  if (t.includes("monitor")) {
    return "monitor";
  }

  if (
    t.includes("cargador") ||
    t.includes("adaptador") ||
    t.includes("cable de poder")
  ) {
    return "accesorio";
  }

  return null;
}

function detectDeviceType(text) {
  const t = normalizeText(text);

  if (t.includes("epson")) return "epson";
  if (t.includes("hp")) return "hp";
  if (t.includes("canon")) return "canon";
  if (t.includes("brother")) return "brother";
  if (t.includes("toshiba")) return "toshiba";
  if (t.includes("dell")) return "dell";
  if (t.includes("lenovo")) return "lenovo";
  if (t.includes("thinkpad")) return "thinkpad";

  return null;
}

function detectBudget(text) {
  const t = normalizeText(text);

  const milMatch = t.match(/(\d{2,4})\s*mil\b/);
  if (milMatch) {
    return parseInt(milMatch[1], 10) * 1000;
  }

  const numberMatches = [...t.matchAll(/\b\d{5,7}\b/g)].map((m) => parseInt(m[0], 10));
  if (numberMatches.length > 0) {
    return Math.max(...numberMatches);
  }

  const crcMatches = [...t.matchAll(/₡\s*([\d.,]+)/g)].map((m) =>
    parseInt(String(m[1]).replace(/[^\d]/g, ""), 10)
  );
  if (crcMatches.length > 0) {
    return Math.max(...crcMatches);
  }

  return null;
}

function detectObjection(text) {
  const t = normalizeText(text);

  if (t.includes("es nueva")) return "is_new";
  if (t.includes("muy cara") || t.includes("muy caro")) return "price_high";
  if (t.includes("garantia")) return "warranty";
  if (t.includes("procesador")) return "processor";
  if (t.includes("por que tan barata") || t.includes("porque tan barata")) return "cheap_suspicion";

  return null;
}

function hasCloseSignal(text) {
  const t = normalizeText(text);

  return (
    t.includes("quiero comprar") ||
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("transferencia") ||
    t.includes("apartar") ||
    t.includes("apartarla") ||
    t.includes("reservar") ||
    t.includes("donde estan") ||
    t.includes("donde estan ubicados") ||
    t.includes("ubicacion") ||
    t.includes("ubicados")
  );
}

function detectUrgency(text) {
  const t = normalizeText(text);

  if (
    t.includes("hoy") ||
    t.includes("urgente") ||
    t.includes("ya") ||
    t.includes("lo antes posible") ||
    t.includes("ahora")
  ) {
    return "high";
  }

  if (
    t.includes("esta semana") ||
    t.includes("pronto") ||
    t.includes("en estos dias")
  ) {
    return "medium";
  }

  return null;
}

function detectSalesOpportunities({
  text,
  productInterest,
  useCase,
  intent,
  pipelineEvent
}) {
  const t = normalizeText(text);
  const opportunities = [];

  if (
    productInterest === "impresora" &&
    (
      t.includes("mantenimiento") ||
      t.includes("no imprime") ||
      t.includes("atasco") ||
      t.includes("mancha") ||
      t.includes("lineas") ||
      t.includes("tinta")
    )
  ) {
    addOpportunity(opportunities, "PRINTER_MAINTENANCE");
  }

  if (
    productInterest === "laptop" &&
    (
      t.includes("lenta") ||
      t.includes("muy lenta") ||
      t.includes("se pega") ||
      t.includes("tarda mucho")
    )
  ) {
    addOpportunity(opportunities, "SSD_UPGRADE");
    addOpportunity(opportunities, "RAM_UPGRADE");
    addOpportunity(opportunities, "MAINTENANCE");
  }

  if (
    productInterest === "laptop" &&
    (
      t.includes("bateria") ||
      t.includes("batería") ||
      t.includes("no carga") ||
      t.includes("se descarga")
    )
  ) {
    addOpportunity(opportunities, "BATTERY_REPLACEMENT");
  }

  if (
    productInterest === "laptop" &&
    (
      intent === "BUY" ||
      pipelineEvent === "PRICE_REQUEST" ||
      pipelineEvent === "CATALOG_REQUEST"
    )
  ) {
    addOpportunity(opportunities, "NEW_DEVICE");
  }

  if (
    useCase === "trabajo" &&
    productInterest === "laptop"
  ) {
    addOpportunity(opportunities, "BUSINESS_LINE_DEVICE");
  }

  if (
    useCase === "estudio" &&
    productInterest === "laptop"
  ) {
    addOpportunity(opportunities, "STUDY_DEVICE");
  }

  if (
    productInterest === "laptop" &&
    (
      pipelineEvent === "PRICE_REQUEST" ||
      pipelineEvent === "CATALOG_REQUEST" ||
      intent === "BUY"
    )
  ) {
    addOpportunity(opportunities, "ACCESSORY_UPSELL");
  }

  return uniqueStrings(opportunities);
}

function calculateLeadScore({
  intent,
  pipelineEvent,
  budget,
  useCase,
  productInterest,
  closeSignal,
  objection,
  urgency,
  opportunities
}) {
  let score = 10;

  if (intent === "GREETING") score += 10;
  if (intent === "INFO") score += 25;
  if (intent === "BUY") score += 45;
  if (intent === "SUPPORT") score += 35;
  if (intent === "CLOSE_INTENT") score += 65;

  if (pipelineEvent === "PRICE_REQUEST") score += 15;
  if (pipelineEvent === "CATALOG_REQUEST") score += 20;
  if (pipelineEvent === "WARRANTY_REQUEST") score += 15;
  if (pipelineEvent === "PAYMENT_INTENT") score += 30;
  if (pipelineEvent === "READY_TO_BUY") score += 35;
  if (pipelineEvent === "SERVICE_REQUEST") score += 20;

  if (budget) score += 15;
  if (useCase) score += 10;
  if (productInterest) score += 10;
  if (closeSignal) score += 20;
  if (urgency === "high") score += 15;
  if (urgency === "medium") score += 8;

  if (Array.isArray(opportunities)) {
    score += Math.min(opportunities.length * 5, 20);
  }

  if (objection === "price_high") score -= 10;

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  return score;
}

function detectStage({
  currentStage,
  intent,
  pipelineEvent,
  closeSignal,
  budget,
  useCase
}) {
  if (pipelineEvent === "PAYMENT_INTENT" || closeSignal) {
    return "CLOSING";
  }

  if (pipelineEvent === "READY_TO_BUY") {
    return "CLOSING";
  }

  if (
    pipelineEvent === "CATALOG_REQUEST" ||
    pipelineEvent === "WARRANTY_REQUEST" ||
    pipelineEvent === "PRICE_REQUEST"
  ) {
    return "OFFER";
  }

  if (pipelineEvent === "SERVICE_REQUEST") {
    return "QUALIFYING";
  }

  if (intent === "BUY") {
    if (budget || useCase) return "OFFER";
    return "QUALIFYING";
  }

  if (intent === "INFO" || intent === "GREETING" || intent === "SUPPORT") {
    return currentStage || "DISCOVERY";
  }

  return currentStage || "DISCOVERY";
}

function deriveLeadStatus(score, stage) {
  if (stage === "CLOSING" || score >= 85) return "HOT";
  if (score >= 50) return "WARM";
  return "NEW";
}

/*
====================================================
DB HELPERS
====================================================
*/

async function findExistingInboundByExternalId({
  organization_id,
  external_message_id
}) {
  if (!external_message_id) return null;

  const result = await pool.query(
    `
    SELECT *
    FROM messages
    WHERE organization_id = $1
      AND external_message_id = $2
    LIMIT 1
    `,
    [organization_id, external_message_id]
  );

  return result.rows[0] || null;
}


async function detectDuplicateByContent({
  organization_id,
  conversation_id,
  text
}) {

  const result = await pool.query(
    `
    SELECT id
    FROM messages
    WHERE organization_id = $1
      AND conversation_id = $2
      AND role = 'user'
      AND content = $3
      AND created_at > NOW() - INTERVAL '5 seconds'
    LIMIT 1
    `,
    [
      organization_id,
      conversation_id,
      text
    ]
  );

  return result.rows.length > 0;

}

async function ensureConversation({
  organization_id,
  phone,
  channel = "whatsapp"
}) {
  const existing = await pool.query(
    `
    SELECT *
    FROM conversations
    WHERE organization_id = $1
      AND external_user_id = $2
      AND channel = $3
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [organization_id, phone, channel]
  );

  if (existing.rows.length > 0) {
    const conversation = existing.rows[0];

    await pool.query(
      `
      UPDATE conversations
      SET updated_at = NOW(),
          last_message_at = NOW()
      WHERE id = $1
      `,
      [conversation.id]
    );

    return {
      ...conversation,
      last_message_at: nowIso()
    };
  }

  const created = await pool.query(
    `
    INSERT INTO conversations (
      organization_id,
      external_user_id,
      channel,
      summary,
      stage,
      created_at,
      updated_at,
      control_mode,
      last_message_at
    )
    VALUES (
      $1, $2, $3, '', 'DISCOVERY', NOW(), NOW(), 'HYBRID', NOW()
    )
    RETURNING *
    `,
    [organization_id, phone, channel]
  );

  return created.rows[0];
}

async function saveMessage({
  organization_id,
  conversation_id,
  role,
  content,
  meta = null,
  external_message_id = null
}) {
  const result = await pool.query(
    `
    INSERT INTO messages (
      organization_id,
      conversation_id,
      role,
      content,
      meta,
      created_at,
      external_message_id
    )
    VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    RETURNING *
    `,
    [
      organization_id,
      conversation_id,
      role,
      content,
      meta,
      external_message_id
    ]
  );

  return result.rows[0];
}

async function upsertLead({
  organization_id,
  phone,
  budget,
  use_case,
  interest_level,
  intent,
  score,
  stage,
  product_interest
}) {
  const existing = await pool.query(
    `
    SELECT *
    FROM leads
    WHERE organization_id = $1
      AND phone = $2
    LIMIT 1
    `,
    [organization_id, phone]
  );

  const status = deriveLeadStatus(score, stage);

  if (existing.rows.length > 0) {
    const current = existing.rows[0];

    const updated = await pool.query(
      `
      UPDATE leads
      SET budget = COALESCE($1, budget),
          use_case = COALESCE($2, use_case),
          interest_level = $3,
          intent = $4,
          score = $5,
          stage = $6,
          status = $7,
          product_interest = COALESCE($8, product_interest),
          last_contact_at = NOW(),
          updated_at = NOW()
      WHERE id = $9
      RETURNING *
      `,
      [
        budget,
        use_case,
        interest_level,
        intent,
        score,
        stage,
        status,
        product_interest,
        current.id
      ]
    );

    return updated.rows[0];
  }

  const created = await pool.query(
    `
    INSERT INTO leads (
      organization_id,
      phone,
      status,
      stage,
      budget,
      use_case,
      interest_level,
      intent,
      score,
      last_contact_at,
      created_at,
      updated_at,
      product_interest
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW(), $10
    )
    RETURNING *
    `,
    [
      organization_id,
      phone,
      status,
      stage,
      budget,
      use_case,
      interest_level,
      intent,
      score,
      product_interest
    ]
  );

  return created.rows[0];
}

async function getCustomerProfile({
  organization_id,
  phone
}) {
  const result = await pool.query(
    `
    SELECT *
    FROM customer_profiles
    WHERE organization_id = $1
      AND external_user_id = $2
    LIMIT 1
    `,
    [organization_id, phone]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  return {
    ...row,
    profile_json: safeJson(row.profile_json, {})
  };
}

async function upsertCustomerProfile({
  organization_id,
  phone,
  memoryPatch
}) {
  const existing = await getCustomerProfile({
    organization_id,
    phone
  });

  if (existing) {
    const mergedProfile = {
      ...safeJson(existing.profile_json, {}),
      ...memoryPatch
    };

    const updated = await pool.query(
      `
      UPDATE customer_profiles
      SET profile_json = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [mergedProfile, existing.id]
    );

    return {
      ...updated.rows[0],
      profile_json: safeJson(updated.rows[0].profile_json, {})
    };
  }

  const created = await pool.query(
    `
    INSERT INTO customer_profiles (
      organization_id,
      external_user_id,
      agent_id,
      profile_json,
      created_at,
      updated_at
    )
    VALUES ($1, $2, NULL, $3, NOW(), NOW())
    RETURNING *
    `,
    [organization_id, phone, memoryPatch]
  );

  return {
    ...created.rows[0],
    profile_json: safeJson(created.rows[0].profile_json, {})
  };
}

async function savePipelineEvent({
  organization_id,
  lead_phone,
  from_stage,
  to_stage,
  reason,
  conversation_id,
  event_type,
  event_data
}) {
  try {
    await pool.query(
      `
      INSERT INTO pipeline_events (
        organization_id,
        lead_phone,
        from_stage,
        to_stage,
        reason,
        created_at,
        conversation_id,
        event_type,
        event_data
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)
      `,
      [
        organization_id,
        lead_phone,
        from_stage,
        to_stage,
        reason,
        conversation_id,
        event_type,
        event_data
      ]
    );
  } catch (err) {
    console.error("pipeline event error", err);
  }
}

async function updateConversationState({
  conversation_id,
  stage,
  summary
}) {
  await pool.query(
    `
    UPDATE conversations
    SET stage = $1,
        summary = $2,
        updated_at = NOW(),
        last_message_at = NOW()
    WHERE id = $3
    `,
    [stage, summary, conversation_id]
  );
}

async function searchCatalogSmart({
  organization_id,
  text,
  budget,
  use_case,
  product_interest,
  brand_hint
}) {
  const result = await pool.query(
    `
    SELECT *
    FROM product_catalog
    WHERE organization_id = $1
      AND is_active = true
    ORDER BY featured DESC, updated_at DESC NULLS LAST, name ASC
    LIMIT 60
    `,
    [organization_id]
  );

  let products = result.rows;

  if (product_interest) {
    products = products.filter((p) =>
      normalizeText(p.category || "").includes(product_interest)
    );
  }

  const normalizedText = normalizeText(text);
  const tokens = uniqueStrings(normalizedText.split(/\s+/).filter((t) => t.length >= 3));

  const scored = products.map((item) => {
    let score = 0;

    const haystack = normalizeText(
      `${item.name || ""} ${item.category || ""} ${item.description || ""}`
    );

    if (product_interest && haystack.includes(product_interest)) score += 25;
    if (brand_hint && haystack.includes(brand_hint)) score += 18;

    if (normalizedText.includes("laptop") && haystack.includes("laptop")) score += 25;
    if (normalizedText.includes("computadora") && haystack.includes("laptop")) score += 18;
    if (normalizedText.includes("thinkpad") && haystack.includes("thinkpad")) score += 35;
    if (normalizedText.includes("latitude") && haystack.includes("latitude")) score += 30;
    if (normalizedText.includes("dell") && haystack.includes("dell")) score += 25;
    if (normalizedText.includes("lenovo") && haystack.includes("lenovo")) score += 25;
    if (normalizedText.includes("monitor") && haystack.includes("monitor")) score += 25;
    if (normalizedText.includes("impresora") && haystack.includes("impresora")) score += 25;
    if (normalizedText.includes("teclado numerico") && (haystack.includes("15") || haystack.includes("numpad"))) score += 15;

    for (const token of tokens) {
      if (haystack.includes(token)) score += 4;
    }

    if (use_case === "estudio") score += 5;
    if (use_case === "trabajo") score += 10;
    if (use_case === "diseno") score += 8;

    if (typeof item.stock === "number" && item.stock > 0) score += 10;
    if (item.featured) score += 10;

    if (budget && typeof item.price_crc === "number") {
      if (item.price_crc <= budget) score += 25;
      const delta = Math.abs(item.price_crc - budget);
      if (delta <= 30000) score += 12;
      if (delta <= 15000) score += 8;
    }

    return {
      ...item,
      _score: score
    };
  });

  return scored
    .filter((item) => item._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);
}

/*
====================================================
REPLY BUILDERS
====================================================
*/

function buildSummary({
  stage,
  intent,
  budget,
  use_case,
  product_interest,
  pipelineEvent,
  opportunities
}) {
  const parts = [
    `stage=${stage}`,
    `intent=${intent}`,
    pipelineEvent ? `event=${pipelineEvent}` : null,
    budget ? `budget=${budget}` : null,
    use_case ? `use_case=${use_case}` : null,
    product_interest ? `product_interest=${product_interest}` : null,
    Array.isArray(opportunities) && opportunities.length
      ? `opportunities=${opportunities.join(",")}`
      : null
  ].filter(Boolean);

  return parts.join(" | ");
}

function formatMoney(value) {
  return `₡${Number(value || 0).toLocaleString("es-CR")}`;
}

function formatCatalogList(items = []) {
  if (!items.length) return "";

  return items
    .map((item) => `• ${item.name} — ${formatMoney(item.price_crc)}`)
    .join("\n");
}

function buildObjectionReply({
  objection,
  catalogMatches = []
}) {
  if (objection === "is_new") {
    return "Son equipos reacondicionados de línea corporativa, revisados y funcionales 👍 La ventaja es que obtienes mejor calidad y respaldo sin pagar de más.";
  }

  if (objection === "price_high") {
    return "Entiendo 👍 La diferencia es que trabajamos línea corporativa revisada, con mejor durabilidad y respaldo. Si me dices tu presupuesto exacto te recomiendo la opción más conveniente.";
  }

  if (objection === "warranty") {
    return "Sí, trabajamos con garantía. Si quieres te recomiendo una opción según tu presupuesto y uso para que veas cuál te conviene más.";
  }

  if (objection === "processor") {
    if (catalogMatches.length > 0) {
      return `Claro 👍 Tengo estas opciones disponibles ahora mismo:\n\n${formatCatalogList(catalogMatches)}\n\nSi me dices si la ocupas para estudio o trabajo te guío mejor.`;
    }

    return "Claro 👍 Si me dices tu presupuesto y si la ocupas para estudio o trabajo te recomiendo la mejor opción disponible.";
  }

  if (objection === "cheap_suspicion") {
    return "Porque son equipos corporativos reacondicionados y revisados, no domésticos nuevos. La idea es darte buena tecnología funcional a mejor precio, sin sacrificar respaldo.";
  }

  return null;
}

function buildCloseReply({
  product_interest,
  catalogMatches = []
}) {
  if (product_interest === "laptop" && catalogMatches.length > 0) {
    const top = catalogMatches.slice(0, 2);

    if (top.length === 1) {
      return `Perfecto 🙌 Esta opción puede servirte muy bien.\n\n${top[0].name} — ${formatMoney(top[0].price_crc)}\n\nSi quieres te la puedo apartar con ₡20.000 para asegurarte la unidad y coordinamos entrega o envío.`;
    }

    return `Perfecto 🙌 Estas son las opciones más cercanas a lo que buscas:\n\n${formatCatalogList(top)}\n\nSi quieres te paso fotos reales o te ayudo a apartar una con ₡20.000 para asegurarte la unidad.`;
  }

  if (product_interest === "impresora") {
    return "Perfecto 🙌 Para avanzar con el servicio lo ideal es revisar primero el equipo. Si quieres te indico el rango de precio y coordinamos cómo traerla al taller.";
  }

  return "Perfecto 🙌 Para avanzar te puedo ayudar con el apartado o con la forma de pago. ¿La ocupas por SINPE, transferencia o tarjeta?";
}

function buildCatalogReply({
  catalogMatches,
  budget,
  use_case
}) {
  if (!catalogMatches.length) {
    if (budget) {
      return `Perfecto 👍 con un presupuesto cercano a ${formatMoney(budget)} te puedo ayudar a buscar una buena opción. ¿La ocupas para estudio o trabajo?`;
    }

    return "Perfecto 👍 te puedo ayudar a elegir la mejor opción. ¿Qué presupuesto manejas más o menos y si la ocupas para estudio o trabajo?";
  }

  let intro = "Te puedo recomendar estas opciones:";
  if (budget) {
    intro = `Te puedo recomendar estas opciones según un presupuesto cercano a ${formatMoney(budget)}:`;
  } else if (use_case) {
    intro = `Te puedo recomendar estas opciones para ${use_case}:`;
  }

  return `${intro}\n\n${formatCatalogList(catalogMatches)}\n\n¿Te gustaría ver fotos o más detalles de alguna?`;
}

function buildPrinterMaintenanceReply({
  text,
  brand_hint
}) {
  const t = normalizeText(text);

  let priceText = "mantenimiento básico ₡20.000";

  if (
    t.includes("no imprime") ||
    t.includes("atasco") ||
    t.includes("mancha") ||
    t.includes("lineas") ||
    t.includes("falla fuerte") ||
    t.includes("muy sucia")
  ) {
    priceText = "mantenimiento profundo ₡30.000+";
  } else if (
    t.includes("revision") ||
    t.includes("revisión") ||
    t.includes("limpieza") ||
    t.includes("mantenimiento")
  ) {
    priceText = "mantenimiento intermedio ₡25.000";
  }

  const brandLine = brand_hint ? ` para impresora ${brand_hint.toUpperCase()}` : "";

  return `Claro 👋 Trabajamos mantenimiento${brandLine}.\n\nEl rango normalmente va así:\n• Básico: ₡20.000\n• Intermedio: ₡25.000\n• Profundo: ₡30.000+\n\nPor lo que me indicas, podría andar cerca de ${priceText}. Para darte un rango más preciso necesito saber qué falla presenta exactamente la impresora.\n\nImportante: el precio final se confirma al revisar el equipo en taller.`;
}

function buildPrinterServiceReply({ brand_hint }) {
  const brandLine = brand_hint ? ` ${brand_hint.toUpperCase()}` : "";

  return `Claro 👋 Con gusto te ayudamos con mantenimiento de impresoras${brandLine}.\n\nTrabajamos con estos rangos:\n• Básico: ₡20.000\n• Intermedio: ₡25.000\n• Profundo: ₡30.000+\n\n¿Qué falla presenta exactamente la impresora? Así te doy un rango más cercano al real.`;
}

function buildLaptopGuidedReply({
  catalogMatches,
  budget,
  use_case,
  opportunities = []
}) {
  if (!catalogMatches.length) {
    return buildCatalogReply({ catalogMatches, budget, use_case });
  }

  let extraLine = "";
  if (opportunities.includes("ACCESSORY_UPSELL")) {
    extraLine = "\n\nSi quieres, también te puedo orientar con accesorios como cargador, mouse o monitor según lo que ocupes.";
  }

  return `Perfecto 👍 Para ${use_case || "lo que me comentas"} te recomiendo estas opciones:\n\n${formatCatalogList(catalogMatches)}\n\nTodas son línea corporativa, revisadas y con garantía.${extraLine}\n\n¿Quieres que te pase fotos reales de alguna?`;
}

function buildAccessoryReply({ brand_hint }) {
  if (brand_hint === "toshiba") {
    return "Sí, con gusto te ayudamos 👍 Para confirmar el cargador correcto de Toshiba Satellite, lo ideal es validar el modelo exacto o una foto del cargador original o etiqueta. Si me la envías te digo si lo tenemos o cuál te sirve.";
  }

  return "Con gusto 👍 Para confirmarte el accesorio correcto, envíame el modelo exacto del equipo o una foto de la etiqueta y así te digo cuál te funciona.";
}

function generateReply({
  text,
  intent,
  pipelineEvent,
  objection,
  closeSignal,
  budget,
  use_case,
  product_interest,
  catalogMatches,
  memory,
  opportunities,
  lead_score,
  brand_hint
}) {
  const objectionReply = buildObjectionReply({
    objection,
    catalogMatches
  });
  if (objectionReply) return objectionReply;

  if (
    opportunities.includes("PRINTER_MAINTENANCE") ||
    pipelineEvent === "SERVICE_REQUEST" ||
    (intent === "SUPPORT" && product_interest === "impresora")
  ) {
    if (
      normalizeText(text).includes("no imprime") ||
      normalizeText(text).includes("atasco") ||
      normalizeText(text).includes("mancha") ||
      normalizeText(text).includes("lineas")
    ) {
      return buildPrinterMaintenanceReply({
        text,
        brand_hint
      });
    }

    return buildPrinterServiceReply({ brand_hint });
  }

  if (product_interest === "accesorio") {
    return buildAccessoryReply({ brand_hint });
  }

  if (
    closeSignal ||
    pipelineEvent === "PAYMENT_INTENT" ||
    pipelineEvent === "READY_TO_BUY" ||
    lead_score >= 85
  ) {
    return buildCloseReply({
      product_interest,
      catalogMatches
    });
  }

  if (pipelineEvent === "CATALOG_REQUEST" || pipelineEvent === "PRICE_REQUEST") {
    if (product_interest === "laptop") {
      return buildLaptopGuidedReply({
        catalogMatches,
        budget: budget || memory?.budget_crc || null,
        use_case: use_case || memory?.use_case || null,
        opportunities
      });
    }

    return buildCatalogReply({
      catalogMatches,
      budget: budget || memory?.budget_crc || null,
      use_case: use_case || memory?.use_case || null
    });
  }

  if (intent === "GREETING") {
    if (memory?.product_interest === "laptop" && memory?.budget_crc) {
      return `Hola 👋 Soy Eva de Compu Store Costa Rica. La última vez estabas buscando una laptop cerca de ${formatMoney(memory.budget_crc)}. ¿Quieres que te comparta opciones disponibles ahora mismo?`;
    }

    return "Hola 👋 Soy Eva de Compu Store Costa Rica. ¿Buscas laptop para estudio o trabajo? Si quieres también me puedes decir tu presupuesto aproximado.";
  }

  if (intent === "INFO") {
    if (product_interest === "laptop") {
      return "Claro 🙂 con gusto te ayudo. Dime tu presupuesto aproximado y si la ocupas para estudio o trabajo para recomendarte mejor.";
    }

    return "Claro 🙂 con gusto te ayudo. Cuéntame un poco más de lo que necesitas y te guío con la mejor opción.";
  }

  if (intent === "SUPPORT") {
    if (product_interest === "impresora") {
      return buildPrinterServiceReply({ brand_hint });
    }

    if (product_interest === "laptop") {
      return "Claro 👋 Podemos revisarlo. Cuéntame qué falla presenta el equipo y te indico si conviene mantenimiento, upgrade o alguna opción de reemplazo.";
    }

    return "Claro 👋 Cuéntame qué equipo estás revisando y qué falla presenta para orientarte mejor.";
  }

  if (intent === "BUY") {
    if (product_interest === "laptop") {
      return buildLaptopGuidedReply({
        catalogMatches,
        budget: budget || memory?.budget_crc || null,
        use_case: use_case || memory?.use_case || null,
        opportunities
      });
    }

    return buildCatalogReply({
      catalogMatches,
      budget: budget || memory?.budget_crc || null,
      use_case: use_case || memory?.use_case || null
    });
  }

  if (memory?.product_interest === "laptop") {
    return "Cuéntame qué presupuesto manejas y si la laptop la ocupas para estudio o trabajo. Así te recomiendo una opción más precisa.";
  }

  return "Cuéntame un poco más de lo que necesitas y te ayudo a orientarte mejor.";
}

/*
====================================================
FOLLOWUPS
====================================================
*/

async function createFollowupIfNeeded({
  organization_id,
  conversation_id,
  lead_phone,
  lead_score,
  stage,
  reason
}) {
  if (!lead_score || lead_score < 40) return;
  if (stage === "CLOSING") return;

  const pending = await pool.query(
    `
    SELECT id
    FROM followups
    WHERE organization_id = $1
      AND conversation_id = $2
      AND status = 'pending'
    LIMIT 1
    `,
    [organization_id, conversation_id]
  );

  if (pending.rows.length > 0) return;

  let hours = 24;
  if (lead_score >= 85) hours = 12;
  else if (lead_score >= 60) hours = 24;
  else hours = 36;

  const dueAtExpression = `${hours} hours`;

  await pool.query(
    `
    INSERT INTO followups (
      organization_id,
      created_at,
      updated_at,
      scheduled_for,
      conversation_id,
      due_at,
      payload,
      lead_phone,
      status,
      reason,
      attempt
    )
    VALUES (
      $1,
      NOW(),
      NOW(),
      NOW() + $2::interval,
      $3,
      NOW() + $2::interval,
      $4,
      $5,
      'pending',
      $6,
      1
    )
    `,
    [
      organization_id,
      dueAtExpression,
      conversation_id,
      {
        source: "salesBrain_rc1",
        lead_score,
        stage
      },
      lead_phone,
      reason || "abandoned_chat"
    ]
  );
}


/*
====================================================
HANDLE INBOUND
====================================================
*/

export async function handleInbound({
  organization_id,
  payload
}) {
  try {
    const phone = normalizePhone(payload?.phone || "");
    const text = String(payload?.message || "").trim();
    const channel = String(payload?.channel || "whatsapp").trim().toLowerCase();
    const external_message_id = payload?.external_message_id
      ? String(payload.external_message_id).trim()
      : null;
    const inboundMeta = payload?.metadata && typeof payload.metadata === "object"
      ? payload.metadata
      : null;

    if (!organization_id) {
      throw new Error("organization_id missing");
    }

    if (!phone) {
      throw new Error("phone missing");
    }

    if (!text) {
      throw new Error("message missing");
    }

    const duplicate = await findExistingInboundByExternalId({
      organization_id,
      external_message_id
    });

    if (duplicate) {
      return {
        ok: true,
        duplicate_ignored: true,
        reply: null,
        intent: null,
        stage: null,
        lead_score: null,
        conversation_id: duplicate.conversation_id,
        lead_id: null
      };
    }

    const existingProfile = await getCustomerProfile({
      organization_id,
      phone
    });

    const existingMemory = existingProfile?.profile_json || {};

    const conversation = await ensureConversation({
      organization_id,
      phone,
      channel
    });

    // Protección secundaria contra duplicados cuando no hay external_message_id
if (!external_message_id) {
  const duplicateByContent = await detectDuplicateByContent({
    organization_id,
    conversation_id: conversation.id,
    text
  });

  if (duplicateByContent) {
    return {
      ok: true,
      duplicate_ignored: true,
      reply: null,
      intent: null,
      stage: null,
      lead_score: null,
      conversation_id: conversation.id,
      lead_id: null
    };
  }
}
    
    const previousStage = conversation.stage || existingMemory.last_stage || "DISCOVERY";

    const rawBrandHint = detectDeviceType(text);
    const rawUseCase = detectUseCase(text);
    const rawProductInterest = detectProductInterest(text);
    const rawBudget = detectBudget(text);

    const intent = detectIntent(text);
    const pipelineEvent = detectPipelineEvent(text);
    const product_interest = rawProductInterest || existingMemory.product_interest || null;
    const use_case = rawUseCase || existingMemory.use_case || null;
    const budget = rawBudget || existingMemory.budget_crc || null;

    // Evita arrastrar marca vieja a otro producto distinto
    let brand_hint = null;
    if (rawBrandHint) {
      brand_hint = rawBrandHint;
    } else if (
      existingMemory.brand_hint &&
      product_interest === existingMemory.product_interest
    ) {
      brand_hint = existingMemory.brand_hint;
    }

    const objection = detectObjection(text);
    const closeSignal = hasCloseSignal(text);
    const urgency = detectUrgency(text);

    const opportunities = detectSalesOpportunities({
      text,
      productInterest: product_interest,
      useCase: use_case,
      intent,
      pipelineEvent
    });

    const stage = detectStage({
      currentStage: previousStage,
      intent,
      pipelineEvent,
      closeSignal,
      budget,
      useCase: use_case
    });

    const lead_score = calculateLeadScore({
      intent,
      pipelineEvent,
      budget,
      useCase: use_case,
      productInterest: product_interest,
      closeSignal,
      objection,
      urgency,
      opportunities
    });

    const interest_level = lead_score;

    const inboundMessage = await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      content: text,
      meta: {
        ...(inboundMeta || {}),
        normalized_text: normalizeText(text)
      },
      external_message_id
    });

    const lead = await upsertLead({
      organization_id,
      phone,
      budget,
      use_case,
      interest_level,
      intent,
      score: lead_score,
      stage,
      product_interest
    });

    const memoryPatch = {
      budget_crc: budget,
      use_case,
      interest_level,
      last_intent: intent,
      last_stage: stage,
      product_interest,
      last_pipeline_event: pipelineEvent,
      last_seen_at: nowIso(),
      brand_hint,
      urgency,
      sales_opportunities: opportunities
    };

    const customerProfile = await upsertCustomerProfile({
      organization_id,
      phone,
      memoryPatch
    });

    const catalogMatches = await searchCatalogSmart({
      organization_id,
      text,
      budget,
      use_case,
      product_interest,
      brand_hint
    });

    const reply = generateReply({
      text,
      intent,
      pipelineEvent,
      objection,
      closeSignal,
      budget,
      use_case,
      product_interest,
      catalogMatches,
      memory: customerProfile?.profile_json || existingMemory,
      opportunities,
      lead_score,
      brand_hint
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      content: reply,
      meta: {
        intent,
        stage,
        lead_score,
        pipeline_event: pipelineEvent,
        objection,
        urgency,
        opportunities,
        catalog_matches: catalogMatches.map((item) => ({
          id: item.id,
          name: item.name,
          price_crc: item.price_crc
        }))
      }
    });

    await updateConversationState({
      conversation_id: conversation.id,
      stage,
      summary: buildSummary({
        stage,
        intent,
        budget,
        use_case,
        product_interest,
        pipelineEvent,
        opportunities
      })
    });

    await savePipelineEvent({
      organization_id,
      lead_phone: phone,
      from_stage: previousStage,
      to_stage: stage,
      reason: pipelineEvent,
      conversation_id: conversation.id,
      event_type: pipelineEvent,
      event_data: {
        message: text,
        intent,
        score: lead_score,
        budget,
        use_case,
        product_interest,
        objection,
        urgency,
        brand_hint,
        opportunities
      }
    });

    await createFollowupIfNeeded({
      organization_id,
      conversation_id: conversation.id,
      lead_phone: phone,
      lead_score,
      stage,
      reason:
        pipelineEvent === "PRICE_REQUEST"
          ? "price_question"
          : pipelineEvent === "CATALOG_REQUEST"
            ? "catalog_sent"
            : pipelineEvent === "SERVICE_REQUEST"
              ? "service_interest"
              : lead_score >= 85
                ? "hot_lead"
                : "abandoned_chat"
    });
    
    return {
      ok: true,
      reply,
      intent,
      stage,
      lead_score,
      conversation_id: conversation.id,
      lead_id: lead.id,
      duplicate_ignored: false,
      data: {
        budget_crc: budget,
        use_case,
        product_interest,
        pipeline_event: pipelineEvent,
        objection,
        urgency,
        brand_hint,
        opportunities
      },
      catalog_matches: catalogMatches.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        description: item.description,
        price_crc: item.price_crc,
        stock: item.stock,
        featured: item.featured
      })),
      inbound_message_id: inboundMessage.id
    };
  } catch (err) {
    console.error("salesBrain error", err);

    return {
      error: "brain_error",
      details: err.message || "unknown brain error"
    };
  }
}
