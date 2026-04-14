/*
====================================================
EVA CORE — ACTION ENGINE (SOT ALIGNED)
====================================================
*/

import { savePipelineEvent } from "./db.js";

/*
====================================================
UTILS
====================================================
*/

function safe(value) {
  return String(value || "").trim();
}

function lowerText(value) {
  return safe(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/*
====================================================
ACTION BUILDERS
====================================================
*/

function buildActionsFromContext(context = {}, text = "") {
  const actions = [];
  const t = lowerText(text);

  const intent = String(context?.intent || "UNKNOWN").toUpperCase();
  const stage = String(context?.stage || "EARLY").toUpperCase();
  const strategy = String(context?.strategy || "DEFAULT").toUpperCase();
  const score = Number(context?.sales_context?.lead_score || 0);
  const interestLevel = String(
    context?.sales_context?.interest_level || "LOW"
  ).toUpperCase();

  const isPriceInterest =
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("cuánto") ||
    t.includes("vale") ||
    t.includes("costo") ||
    t.includes("cuesta");

  const isAvailabilityInterest =
    t.includes("disponible") ||
    t.includes("tienen") ||
    t.includes("tiene") ||
    t.includes("hay") ||
    t.includes("stock") ||
    t.includes("cuantas tiene") ||
    t.includes("cuántas tiene");

  const isBuySignal =
    t.includes("quiero") ||
    t.includes("comprar") ||
    t.includes("me interesa") ||
    t.includes("apartar") ||
    t.includes("apartado") ||
    t.includes("coordinar");

  const isServiceSignal =
    intent === "SERVICE" ||
    t.includes("mantenimiento") ||
    t.includes("reparacion") ||
    t.includes("reparación") ||
    t.includes("servicio tecnico") ||
    t.includes("servicio técnico");

  if (isPriceInterest) {
    actions.push({
      type: "MARK_PRICE_INTEREST",
      priority: "MEDIUM",
      payload: {
        source: "action_engine",
        score,
        interest_level: interestLevel,
      },
    });
  }

  if (isAvailabilityInterest) {
    actions.push({
      type: "MARK_AVAILABILITY_INTEREST",
      priority: "MEDIUM",
      payload: {
        source: "action_engine",
        score,
        interest_level: interestLevel,
      },
    });
  }

  if (intent === "BUY" && stage === "MID") {
    actions.push({
      type: "CREATE_SALES_OPPORTUNITY",
      priority: "MEDIUM",
      payload: {
        source: "action_engine",
        stage,
        strategy,
        score,
      },
    });
  }

  if (
    intent === "BUY" &&
    (stage === "HOT" || strategy === "CLOSE" || isBuySignal)
  ) {
    actions.push({
      type: "MARK_HOT_LEAD",
      priority: "HIGH",
      payload: {
        source: "action_engine",
        stage,
        strategy,
        score,
        interest_level: interestLevel,
      },
    });

    actions.push({
      type: "NOTIFY_OWNER",
      priority: "HIGH",
      payload: {
        source: "action_engine",
        reason: "hot_lead_detected",
        score,
        interest_level: interestLevel,
      },
    });

    actions.push({
      type: "CREATE_SALES_OPPORTUNITY",
      priority: "HIGH",
      payload: {
        source: "action_engine",
        stage,
        strategy,
        score,
      },
    });
  }

  if (isServiceSignal && stage !== "POST") {
    actions.push({
      type: "CREATE_SERVICE_OPPORTUNITY",
      priority: "MEDIUM",
      payload: {
        source: "action_engine",
        stage,
        strategy,
        score,
      },
    });
  }

  if (score >= 70 || interestLevel === "HIGH") {
    actions.push({
      type: "PRIORITIZE_FOLLOWUP",
      priority: "HIGH",
      payload: {
        source: "action_engine",
        score,
        interest_level: interestLevel,
      },
    });
  }

  return actions;
}

/*
====================================================
ACTION EXECUTION
====================================================
*/

async function persistActionEvent({
  organization_id,
  conversation_id,
  phone,
  lead_id,
  action,
  context,
}) {
  await savePipelineEvent({
    organization_id,
    conversation_id,
    lead_phone: phone,
    event_type: "ACTION_EXECUTED",
    event_data: {
      action_type: action.type,
      priority: action.priority,
      payload: action.payload || {},
      intent: context.intent,
      stage: context.stage,
      strategy: context.strategy,
      lead_id: lead_id || null,
    },
  });
}

export async function executeActions({
  organization_id,
  conversation_id,
  phone,
  lead_id = null,
  context = {},
  text = "",
}) {
  try {
    if (!organization_id || !conversation_id) {
      return [];
    }

    const actions = buildActionsFromContext(context, text);

    for (const action of actions) {
      await persistActionEvent({
        organization_id,
        conversation_id,
        phone,
        lead_id,
        action,
        context,
      });
    }

    return actions;
  } catch (err) {
    console.error("executeActions error", err.message);
    return [];
  }
}
