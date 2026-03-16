/*
====================================================
EVA SALES BRAIN
Commercial Decision Engine
====================================================

Responsabilidades principales:
• Procesar mensajes entrantes
• Detectar intención comercial
• Actualizar CRM
• Buscar catálogo
• Generar respuesta comercial
• Registrar eventos de pipeline
• Crear followups automáticos

Arquitectura futura:
Este archivo actuará como ORCHESTRATOR.
La lógica se moverá gradualmente a módulos.

brain/
 ├ utils/
 ├ engines/
 ├ commerce/
 └ replies/
====================================================
*/

import pool from "./db.js";


/*
====================================================
UTILITIES — NORMALIZATION
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

function formatMoney(value) {
  return `₡${Number(value || 0).toLocaleString("es-CR")}`;
}


/*
====================================================
CONTEXT ENGINE
Construye texto contextual combinando memoria + mensaje
====================================================
*/

function buildContextText({ text, memory = {} }) {

  const parts = [
    text,
    memory?.product_interest,
    memory?.use_case,
    memory?.brand_hint,
    memory?.last_pipeline_event,
    Array.isArray(memory?.sales_opportunities)
      ? memory.sales_opportunities.join(" ")
      : null
  ];

  return normalizeText(parts.filter(Boolean).join(" "));
}


/*
====================================================
CONTEXT INFERENCE
Inferencia de producto usando memoria + señales
====================================================
*/

function inferProductFromContext({ text, useCase, memory = {} }) {

  const t = normalizeText(text);
  const rememberedProduct = memory?.product_interest || null;

  if (
    t.includes("universidad") ||
    t.includes("colegio") ||
    t.includes("escuela") ||
    t.includes("clases") ||
    t.includes("tareas") ||
    t.includes("office") ||
    t.includes("excel") ||
    t.includes("teletrabajo") ||
    t.includes("portatil") ||
    t.includes("portátil")
  ) {
    return "laptop";
  }

  if (
    useCase === "estudio" ||
    useCase === "trabajo" ||
    useCase === "diseno" ||
    useCase === "gaming"
  ) {
    return "laptop";
  }

  if (
    t.includes("mantenimiento de impresora") ||
    t.includes("no imprime") ||
    t.includes("atasco") ||
    t.includes("tinta") ||
    t.includes("cartucho")
  ) {
    return "impresora";
  }

  if (
    t.includes("doble pantalla") ||
    t.includes("full hd 15.6") ||
    t.includes("monitor portatil") ||
    t.includes("monitor portátil")
  ) {
    return "monitor";
  }

  return rememberedProduct;
}


/*
====================================================
SIGNAL DETECTION
Motores heurísticos para interpretar el mensaje
====================================================
*/


/*
----------------------------------------------------
INTENT DETECTION
----------------------------------------------------
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
    t.includes("quiero comprar laptop") ||
    t.includes("algo para estudio") ||
    t.includes("algo para trabajo") ||
    t.includes("algo barato") ||
    t.includes("ocupo una compu") ||
    t.includes("ocupo una computadora")
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
    t.includes("revision") ||
    t.includes("revisión") ||
    t.includes("no imprime") ||
    t.includes("no enciende") ||
    t.includes("esta lenta") ||
    t.includes("está lenta") ||
    t.includes("esta muy lenta") ||
    t.includes("está muy lenta") ||
    t.includes("falla")
  ) {
    return "SUPPORT";
  }

  if (
    t === "hola" ||
    t === "buenas" ||
    t.includes("buenos dias") ||
    t.includes("buen día") ||
    t.includes("buen dia") ||
    t.includes("buenas tardes") ||
    t.includes("buenas noches")
  ) {
    return "GREETING";
  }

  return "UNKNOWN";
}


/*
----------------------------------------------------
PIPELINE EVENT DETECTION
----------------------------------------------------
*/

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
    t.includes("imágenes") ||
    t.includes("imagenes reales") ||
    t.includes("imágenes reales") ||
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
    t.includes("servicio técnico") ||
    t.includes("no imprime") ||
    t.includes("reparacion")
  ) {
    return "SERVICE_REQUEST";
  }

  if (
    t === "hola" ||
    t === "buenas" ||
    t.includes("buenos dias") ||
    t.includes("buen dia")
  ) {
    return "GREETING";
  }

  return "QUESTION";
}


/*
====================================================
USO / PRODUCTO / PRESUPUESTO
====================================================
*/

function detectUseCase(text) { /* ...sin cambios... */ }

function detectProductInterest(text) { /* ...sin cambios... */ }

function detectDeviceType(text) { /* ...sin cambios... */ }

function detectBudget(text) { /* ...sin cambios... */ }


/*
====================================================
VENTAS — SEÑALES COMERCIALES
====================================================
*/

function detectObjection(text) { /* ...sin cambios... */ }

function hasCloseSignal(text) { /* ...sin cambios... */ }

function detectUrgency(text) { /* ...sin cambios... */ }

function detectSalesSignals(text) { /* ...sin cambios... */ }


/*
====================================================
OPPORTUNITY ENGINE
Detecta oportunidades de venta cruzada o servicio
====================================================
*/

function detectSalesOpportunities({...}) { /* ...sin cambios... */ }


/*
====================================================
LEAD SCORING
====================================================
*/

function calculateLeadScore({...}) { /* ...sin cambios... */ }

function detectStage({...}) { /* ...sin cambios... */ }

function deriveLeadStatus(score, stage) { /* ...sin cambios... */ }


/*
====================================================
DATABASE HELPERS
====================================================
*/

async function findExistingInboundByExternalId({...}) { /* ... */ }

async function detectDuplicateByContent({...}) { /* ... */ }

async function ensureConversation({...}) { /* ... */ }

async function saveMessage({...}) { /* ... */ }

async function upsertLead({...}) { /* ... */ }

async function getCustomerProfile({...}) { /* ... */ }

async function upsertCustomerProfile({...}) { /* ... */ }

async function savePipelineEvent({...}) { /* ... */ }

async function updateConversationState({...}) { /* ... */ }


/*
====================================================
COMMERCE ENGINE
Búsqueda inteligente de catálogo
====================================================
*/

async function searchCatalogSmart({...}) { /* ...sin cambios... */ }


/*
====================================================
REPLY BUILDERS
Construcción de respuestas comerciales
====================================================
*/

function buildSummary({...}) { /* ... */ }

function formatCatalogList(items = []) { /* ... */ }

function buildObjectionReply({...}) { /* ... */ }

function buildCloseReply({...}) { /* ... */ }

function buildCatalogReply({...}) { /* ... */ }

function buildPrinterMaintenanceReply({...}) { /* ... */ }

function buildPrinterServiceReply({...}) { /* ... */ }

function buildLaptopGuidedReply({...}) { /* ... */ }

function buildAccessoryReply({...}) { /* ... */ }

function buildSmartFallback({...}) { /* ... */ }


/*
====================================================
REPLY ORCHESTRATOR
====================================================
*/

function generateReply({...}) { /* ...sin cambios... */ }


/*
====================================================
FOLLOWUP ENGINE
====================================================
*/

async function createFollowupIfNeeded({...}) { /* ... */ }


/*
====================================================
MAIN ORCHESTRATOR
HANDLE INBOUND MESSAGE
====================================================
*/

export async function handleInbound({ organization_id, payload }) {

  try {

    /*
    ----------------------------------------------------
    STEP 1 — VALIDATION
    ----------------------------------------------------
    */

    const phone = normalizePhone(payload?.phone || "");
    const text = String(payload?.message || "").trim();

    /*
    ----------------------------------------------------
    STEP 2 — DUPLICATE CHECK
    ----------------------------------------------------
    */

    /*
    ----------------------------------------------------
    STEP 3 — CONTEXT BUILD
    ----------------------------------------------------
    */

    /*
    ----------------------------------------------------
    STEP 4 — SIGNAL DETECTION
    ----------------------------------------------------
    */

    /*
    ----------------------------------------------------
    STEP 5 — CRM UPDATE
    ----------------------------------------------------
    */

    /*
    ----------------------------------------------------
    STEP 6 — CATALOG SEARCH
    ----------------------------------------------------
    */

    /*
    ----------------------------------------------------
    STEP 7 — REPLY GENERATION
    ----------------------------------------------------
    */

    /*
    ----------------------------------------------------
    STEP 8 — FOLLOWUPS
    ----------------------------------------------------
    */

  } catch (err) {

    console.error("salesBrain error", err);

    return {
      error: "brain_error",
      details: err.message || "unknown brain error"
    };

  }
}
