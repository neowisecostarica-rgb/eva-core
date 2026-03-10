import pool from "./db.js";

async function getDueFollowups() {

  const result = await pool.query(`
    SELECT *
    FROM followups
    WHERE status = 'pending'
      AND due_at <= NOW()
    ORDER BY due_at ASC
    LIMIT 20
  `);

  return result.rows;

}

function generateFollowupMessage(followup) {

  if (followup.reason === "hot_lead") {
    return "Hola 🙂 te escribo porque hace un momento consultaste por un equipo. Si quieres puedo ayudarte a elegir el mejor según tu presupuesto.";
  }

  if (followup.reason === "catalog_sent") {
    return "Hola 🙂 solo quería saber si pudiste ver las opciones que te enviamos.";
  }

  if (followup.reason === "price_question") {
    return "Hola 🙂 si tienes alguna duda sobre el precio o las características del equipo puedo ayudarte.";
  }

  if (followup.reason === "abandoned_chat") {
    return "Hola 🙂 seguimos teniendo equipos disponibles por si todavía estás buscando.";
  }

  return "Hola 🙂 solo quería saber si todavía estás buscando equipo.";
}

async function markFollowupSent(id) {

  await pool.query(
    `
    UPDATE followups
    SET status = 'sent',
        updated_at = NOW()
    WHERE id = $1
    `,
    [id]
  );

}

async function processFollowups() {

  const followups = await getDueFollowups();

  if (followups.length === 0) return;

  for (const f of followups) {

    const message = generateFollowupMessage(f);

    console.log("FOLLOWUP TRIGGERED", {
      phone: f.lead_phone,
      reason: f.reason,
      message
    });

    /*
      Aquí luego enviaremos a WhatsApp
      await sendWhatsAppMessage(f.lead_phone, message);
    */

    await markFollowupSent(f.id);

  }

}

export function startFollowupWorker() {

  console.log("Followup worker started");

  setInterval(async () => {

    try {

      await processFollowups();

    } catch (err) {

      console.error("Followup worker error", err);

    }

  }, 60000);

}
