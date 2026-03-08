const GRAPH_URL = "https://graph.facebook.com/v18.0";

export async function sendWhatsAppMessage({
  phoneNumberId,
  token,
  to,
  text
}) {

  try {

    const url = `${GRAPH_URL}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: text
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("WhatsApp API error:", data);
    }

    return data;

  } catch (error) {

    console.error("WhatsApp send error:", error);
    return null;

  }

}
