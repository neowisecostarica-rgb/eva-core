# EVA CORE — SOURCE OF TRUTH (OFFICIAL)

## Baseline

Stable version reference:
ZIP 19 = stable baseline

---

## Database Source of Truth

DATABASE: eva_zbth  
ORG_PRIMARY: db83e3f9-d971-4ed1-9b6d-82408fbd7c03

---

## Official Structure

src/

- server.js
- db.js
- salesBrain.js

routes/
- messages.js
- whatsappWebhook.js
- metrics.js

brain/
- engines/
- replies/
- utils/

connectors/
- whatsapp.js

lib/
- auth.js
- security.js

validators.js  
followupWorker.js  

api/ (LEGACY — do not modify without audit)

---

## System Flow

WhatsApp  
→ webhook  
→ /v1/messages/inbound  
→ validateInbound  
→ handleInboundMessage  
→ brain/*  
→ DB  
→ response  
→ connectors/whatsapp  
→ Meta API  

---

## Inbound Contract

```json
{
  "organization_id": "uuid",
  "phone": "string",
  "text": "string",
  "channel": "whatsapp",
  "message_id": "string | null"
}
