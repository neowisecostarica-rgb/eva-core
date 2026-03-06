// salesBrain.js — EVA Sales Brain v9
// Rules + Memory + Catalog + AI fallback + Confidence + Stage + CRM Data + Followups + Sales Detection

// ===============================
// INTENT DETECTION
// ===============================

export function detectIntentRule(text = "") {
  const t = text.toLowerCase();
  const hasAny = (...arr) => arr.some(w => t.includes(w));

  if (hasAny("hola", "buenas", "buen día", "buenos días", "buenas tardes", "buenas noches", "hey", "saludos")) {
    return { intent: "GREETING", confidence: 0.95 };
  }

  if (hasAny("no funciona", "daño", "problema", "error", "pantalla", "teclado", "batería", "garantía", "reparar", "soporte", "servicio técnico")) {
    return { intent: "SUPPORT", confidence: 0.85 };
  }

  if (
    hasAny(
      "precio","cuánto cuesta","cuanto cuesta","vale","costo",
      "disponible","tiene","tienen","tienes","me interesa",
      "quiero","comprar","apartarlo","apartar","envío","envio",
      "entrega","fotos","modelo","ram","ssd"
    )
  ) {
    return { intent: "BUY", confidence: 0.75 };
  }

  return { intent: "INFO", confidence: 0.55 };
}

// ===============================
// LEAD SCORING
// ===============================

export function scoreLead({ intent, text = "" }) {

  const t = text.toLowerCase();
  let score = 0;

  if (intent === "GREETING") score += 10;
  if (intent === "INFO") score += 20;
  if (intent === "SUPPORT") score += 30;
  if (intent === "BUY") score += 45;

  const bump = (cond, pts) => { if (cond) score += pts };

  bump(t.includes("precio"),10)
  bump(t.includes("fotos"),15)
  bump(t.includes("envio") || t.includes("entrega"),10)
  bump(t.includes("apart") || t.includes("sinpe"),20)
  bump(t.includes("lo quiero") || t.includes("me lo llevo"),25)

  if (score > 100) score = 100;

  return score
}

// ===============================
// SALES SIGNAL DETECTION
// ===============================

export function detectSaleSignal(text = "") {

  const t = text.toLowerCase()

  const signals = [
    "lo quiero",
    "me lo llevo",
    "apartarlo",
    "apartar",
    "reservar",
    "reservo",
    "donde pago",
    "dónde pago",
    "sinpe",
    "pago",
    "lo compro",
    "comprarlo",
    "comprar ya"
  ]

  return signals.some(s => t.includes(s))
}

// ===============================
// DATA EXTRACTION
// ===============================

export function extractBudgetCRC(text=""){

  const t=text.toLowerCase().replace(/\./g,"").replace(/,/g,"")

  const m1=t.match(/₡\s?(\d+)/)
  if(m1) return parseInt(m1[1])

  const m2=t.match(/(\d+)\s?mil/)
  if(m2) return parseInt(m2[1])*1000

  return null
}

export function extractUseCase(text=""){

  const t=text.toLowerCase()

  if(t.includes("universidad")||t.includes("colegio")||t.includes("estudio")) return "study"
  if(t.includes("trabajo")||t.includes("oficina")) return "work"
  if(t.includes("gaming")||t.includes("juegos")) return "gaming"

  return null
}

export function extractUrgency(text="",leadScore=0){

  const t=text.toLowerCase()

  if(t.includes("hoy")||t.includes("ya")||t.includes("urgente")) return "high"

  if(leadScore>=80) return "high"
  if(leadScore>=50) return "medium"

  return "low"
}

// ===============================
// PROFILE MEMORY
// ===============================

export async function getOrCreateProfile(pool,{orgId,externalUserId,agentId}){

  const r=await pool.query(
    `SELECT * FROM customer_profiles
     WHERE organization_id=$1 AND external_user_id=$2
     LIMIT 1`,
    [orgId,externalUserId]
  )

  if(r.rows.length) return r.rows[0]

  const created=await pool.query(
    `INSERT INTO customer_profiles
     (organization_id,external_user_id,agent_id,profile_json)
     VALUES($1,$2,$3,'{}'::jsonb)
     RETURNING *`,
    [orgId,externalUserId,agentId||null]
  )

  return created.rows[0]
}

export async function updateProfile(pool,{profileId,patch}){

  await pool.query(
    `UPDATE customer_profiles
     SET profile_json = profile_json || $2::jsonb,
         updated_at = now()
     WHERE id=$1`,
    [profileId,JSON.stringify(patch)]
  )

}

// ===============================
// FOLLOWUPS
// ===============================

async function createPendingFollowup(pool,{orgId,conversationId,leadScore}){

  if(leadScore<40) return

  await pool.query(
    `INSERT INTO followups
     (organization_id,conversation_id,status,scheduled_for)
     VALUES($1,$2,'pending',now()+interval '2 hours')`,
    [orgId,conversationId]
  )

}

// ===============================
// MAIN INBOUND HANDLER
// ===============================

export async function handleInbound({

  pool,
  openai,
  org,
  agentId,
  conversationId,
  externalUserId,
  text,
  channel

}){

  const {intent,confidence}=detectIntentRule(text)

  const leadScore=scoreLead({intent,text})

  const saleSignal=detectSaleSignal(text)

  const profile=await getOrCreateProfile(pool,{
    orgId:org.id,
    externalUserId,
    agentId
  })

  const budget=extractBudgetCRC(text)
  const useCase=extractUseCase(text)
  const urgency=extractUrgency(text,leadScore)

  const patch={}

  if(budget) patch.budget_crc=budget
  if(useCase) patch.use_case=useCase

  if(intent==="BUY"){
    patch.stage=leadScore>=85?"CLOSING":leadScore>=60?"OFFER":"DISCOVERY"
  }

  if(Object.keys(patch).length){

    await updateProfile(pool,{
      profileId:profile.id,
      patch
    })

  }

  // ===============================
  // PIPELINE EVENT
  // ===============================

  await pool.query(
    `INSERT INTO pipeline_events
     (organization_id,conversation_id,event_type,payload)
     VALUES($1,$2,'INBOUND_INTEL',$3)`,
    [org.id,conversationId,JSON.stringify({intent,leadScore})]
  )

  // ===============================
  // SALES DETECTION
  // ===============================

  if(saleSignal){

    await pool.query(
      `INSERT INTO sales
       (organization_id,conversation_id,external_user_id,status)
       VALUES($1,$2,$3,'detected')`,
      [org.id,conversationId,externalUserId]
    )

  }

  await createPendingFollowup(pool,{
    orgId:org.id,
    conversationId,
    leadScore
  })

  // ===============================
  // AI RESPONSE
  // ===============================

  const ai=await openai.chat.completions.create({

    model:"gpt-4o-mini",

    messages:[
      {
        role:"system",
        content:"Eres EVA, una asistente de ventas inteligente. Responde corto y orientado a cerrar ventas."
      },
      {role:"user",content:text}
    ]

  })

  const reply=ai.choices?.[0]?.message?.content?.trim()

  return {

    reply,
    intent,
    confidence,
    leadScore,
    data:{
      budget_crc:budget,
      use_case:useCase,
      urgency
    }

  }

}
