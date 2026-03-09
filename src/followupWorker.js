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

    let message = "Hola 🙂 solo quería saber si todavía estás buscando equipo.";

    if (f.payload && f.payload.template) {

      message = f.payload.template;

    }

    console.log("FOLLOWUP TRIGGERED", {
      phone: f.lead_phone,
      message
    });

    // Aquí luego enviaremos a WhatsApp
    // await sendWhatsAppMessage(f.lead_phone, message);

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
