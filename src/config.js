/*
====================================================
EVA CORE — CONFIG (SoT EJECUTABLE)
====================================================
*/

export const CONFIG = {
  routes: {
    webhook: "/webhook",
    inbound: "/v1/messages/inbound",
    health: "/health"
  },

  env: {
    REQUIRED: [
      "WHATSAPP_TOKEN",
      "WHATSAPP_VERIFY_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "EVA_ENDPOINT",
      "EVA_API_KEY",
      "DATABASE_URL"
    ]
  }
};
