import fetch from "node-fetch";

const GRAPH_URL = "https://graph.facebook.com/v18.0";

export async function sendWhatsAppMessage({
  phoneNumberId,
  token,
  to,
  text
}) {

  try {

    const url = `${GRAPH_URL}/${phoneNumberId}/messages`;

    const body = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body: text
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("WhatsApp send error:", data);
    }

    return data;

  } catch (error) {

    console.error("WhatsApp connector error:", error);

    return null;

  }

}
