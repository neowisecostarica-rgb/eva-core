/*
====================================================
EVA CORE — SALES BRAIN
(BRAIN + CATALOG + LEAD INTELLIGENCE + BUSINESS GUARDS + PIPELINE SOLID)
====================================================
*/

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import db from "./db.js";

import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";

import { detectPipelineEvent } from "./brain/engines/pipelineEngine.js";
import { detectIntent } from "./brain/engines/intentEngine.js";

/*
====================================================
NORMALIZADORES
====================================================
*/

function normalizeIntent(intent) {
  if (!intent) return "OTHER";

  const clean = String(intent).toUpperCase();

  if (["BUY", "PURCHASE"].includes(clean)) return "BUY";
  if (["INFO", "QUESTION"].includes(clean)) return "INFO";
  if (["SUPPORT", "HELP"].includes(clean)) return "SUPPORT";
  if (["GREETING", "HELLO"].includes(clean)) return "GREETING";
  if (["SERVICE"].includes(clean)) return "SERVICE";

  return clean;
}

function normalizeStage(stage) {
  const safeStage = String(stage || "new").toLowerCase();

  if (safeStage === "new" || safeStage === "early") return "new";
  if (safeStage === "qualifying") return "qualifying";
  if (safeStage === "consideration" || safeStage === "mid") return "consideration";
  if (safeStage === "hot" || safeStage === "ready_to_buy") return "hot";
  if (safeStage === "closing") return "closing";
  if (safeStage === "post") return "post";

  return "new";
}

/*
====================================================
BRAIN HELPERS
====================================================
*/

function buildKnownData({ text, lead, history }) {
  return {
    last_message: text || "",
    lead_stage: lead?.stage || "new",
    history_count: Array.isArray(history) ? history.length : 0,
    has_history: Array.isArray(history) && history.length > 0,
  };
}

/*
====================================================
LEAD INTELLIGENCE
====================================================
*/

function extractLeadData(text = "") {
  const t = text.toLowerCase();

  let use_case = null;

  if (t.includes("estudio") || t.includes("colegio") || t.includes("universidad")) {
    use_case = "study";
  }

  if (t.includes("trabajo") || t.includes("oficina") || t.includes("empresa")) {
    use_case = "work";
  }

  if (t.includes("gaming") || t.includes("juegos") || t.includes("fortnite")) {
    use_case = "gaming";
  }

  return { use_case };
}

async function updateLeadIntelligence({ organization_id, lead_id, extracted }) {
  try {
    if (!lead_id || !extracted) return;

    const fields = [];
    const values = [];
    let idx = 1;

    if (extracted.use_case) {
      fields.push(`use_case = $${idx++}`);
      values.push(extracted.use_case);
    }

    if (fields.length === 0) return;

    values.push(lead_id);
    values.push(organization_id);

    const query = `
      UPDATE leads
      SET ${fields.join(", ")},
          updated_at = NOW()
      WHERE id = $${idx++}
      AND organization_id = $${idx}
    `;

    await db.query(query, values);
  } catch (err) {
    console.warn("⚠️ Lead update error:", err);
  }
}

/*
====================================================
STRATEGY (ESTABLE)
====================================================
*/

function decideStrategy({ intent, stage, known_data }) {
  const safeIntent = normalizeIntent(intent);
  const safeStage = normalizeStage(stage);
  const data = known_data || {};

  if (safeIntent === "SERVICE") {
    if (!data.problem) return "ASK";
    return "EXPLAIN_CLOSE";
  }

  if (safeIntent === "BUY") {
    if (safeStage === "new") return "QUALIFY";
    if (safeStage === "qualifying") return "QUALIFY";
    if (safeStage === "consideration") return "RECOMMEND";
    if (safeStage === "hot") return "CLOSE";
    if (safeStage === "closing") return "CLOSE";
    return "QUALIFY";
  }

  if (safeIntent === "FOLLOWUP") return "FOLLOWUP";
  if (safeIntent === "INFO") return "EXPLAIN";
  if (safeIntent === "GREETING") return "ASK";

  return "ASK";
}

/*
====================================================
CONTEXT
====================================================
*/

function buildContext({
  organization_id,
  phone,
  text,
  intent,
  stage,
  strategy,
  history,
  known_data,
  config,
}) {
  const safeHistory = Array.isArray(history) ? history : [];

  const lastMessages = safeHistory.slice(-5).map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    text: m.text,
  }));

  const context = {
    meta: {
      organization_id,
      phone,
    },

    input: {
      text,
      intent,
    },

    lead: {
      stage: stage || "new",
      known_data: known_data || {},
    },

    conversation: {
      history_count: safeHistory.length,
      last_messages: lastMessages,
      has_history: safeHistory.length > 0,
    },

    strategy: {
      current: strategy,
    },

    config: config || {},
  };

  return context;
}
