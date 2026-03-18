/*
====================================================
WHATSAPP CONNECTOR
Send messages to WhatsApp Cloud API
====================================================
*/

import fetch from "node-fetch";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

export async function sendWhatsAppMessage({ to, message }) {

  if (!PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
    console.error("❌ WhatsApp config missing:", {
      PHONE_NUMBER_ID,
      WHATSAPP_TOKEN: WHATSAPP_TOKEN ? "OK" : "MISSING"
    });
    return;
  }

  const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

  console.log("📤 Sending WhatsApp message:", {
    to,
    url
  });

  try {

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: message
        }
      })
    });

    const data = await response.json();

    console.log("✅ WhatsApp response:", data);

    return data;

  } catch (err) {

    console.error("❌ WhatsApp send error:", err.message);

  }

}
